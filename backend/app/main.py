from fastapi import FastAPI, HTTPException, Body, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import httpx
import re
import os
import json
import hashlib
from datetime import datetime

# 获取根路径与本地数据持久化路径
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_FILE = os.path.abspath(os.path.join(BASE_DIR, "data.json"))
CONFIG_FILE = os.path.abspath(os.path.join(BASE_DIR, "config.json"))
DEFAULT_VOLC_KEY = "ark-955e822c-cde0-427a-8686-85ca4ada387a-c191f"

app = FastAPI(title="Plate Query System Proxy API")

# 允许跨域 CORS，让本地 Vanilla 前端能直接请求
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 强制禁用浏览器静态强缓存的 HTTP 中间件，保障前端源码任何微调都能在普通刷新下瞬间无缝生效
@app.middleware("http")
async def add_no_cache_headers(request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    return response

# 中国车牌校验正则表达式（覆盖传统7位及新能源8位车牌，并支持挂、学、警等特种车牌）
PLATE_REGEX = re.compile(
    r"^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-HJ-NP-Z][A-HJ-NP-Z0-9]{4,6}[挂学警港澳变超]?$"
)

# 模糊提取工地名称/企业名称的字段键候选集
WORKSITE_KEYS = {"worksitename", "unitname", "enterprisename", "name", "title", "worksitename"}


class QueryRequest(BaseModel):
    authtoken: str
    id: str = "225642"
    worksitetype: str = "1"


class WaybillQueryRequest(BaseModel):
    authtoken: str
    page: int = 1
    limit: int = 50
    id: str = ""
    state: str = ""
    starTime: str = ""
    endTime: str = ""
    code: str = ""
    overloadRatio: str = ""
    absorptivename: str = ""
    type: int = 1


class LoginTokenRequest(BaseModel):
    username: str
    password: str
    code: str
    uuid: str = ""


class PublicApiConfigPayload(BaseModel):
    public_api_enabled: bool = True
    public_api_key: str = ""


REMOTE_BASE_URL = "http://ztxn.capcloud.com.cn:8080/dregs_service-dev"
REMOTE_ORIGIN = "http://ztxn.capcloud.com.cn:8080"
REMOTE_REFERER = "http://ztxn.capcloud.com.cn:8080/dist/index.html"


def _get_effective_authtoken(provided_token: str = "") -> str:
    if provided_token and provided_token.strip():
        return provided_token.strip()
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                config = json.load(f)
                token = config.get("authtoken", "").strip()
                if token:
                    return token
        except Exception:
            pass
    return ""

def _remote_headers(authtoken: str = "") -> Dict[str, str]:
    effective_token = _get_effective_authtoken(authtoken)
    return {
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "Content-Type": "application/json",
        "Origin": REMOTE_ORIGIN,
        "Referer": REMOTE_REFERER,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
        "authtoken": effective_token,
    }


def _is_business_success(data: Dict[str, Any]) -> bool:
    code = data.get("code")
    success = data.get("success")
    if success is False:
        return False
    if code is None:
        return True
    return str(code) in ("2000", "200", "0")


def _business_message(data: Dict[str, Any], fallback: str) -> str:
    return str(data.get("message") or data.get("msg") or fallback)


def _remote_error_detail(data: Any, fallback: str) -> Dict[str, Any]:
    if not isinstance(data, dict):
        return {
            "message": fallback,
            "remote": data,
        }

    remote = {
        key: data.get(key)
        for key in ("code", "message", "msg", "success", "result")
        if key in data
    }
    return {
        "message": _business_message(data, fallback),
        "remote": remote or data,
    }


def _extract_token(data: Any) -> Optional[str]:
    token_keys = ("token", "authtoken", "authToken", "access_token", "accessToken")
    if isinstance(data, dict):
        for key in token_keys:
            value = data.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        for value in data.values():
            found = _extract_token(value)
            if found:
                return found
    elif isinstance(data, list):
        for item in data:
            found = _extract_token(item)
            if found:
                return found
    return None


def _build_login_payload(username: str, password: str, code: str, uuid: str = "") -> Dict[str, Any]:
    password_md5 = hashlib.md5(password.encode("utf-8")).hexdigest()
    return {
        "identifierCode": "pc",
        "uuid": uuid.strip(),
        "userInfo": {
            "username": username.strip(),
            "pwd": password_md5,
        },
        "kaptcha": code.strip(),
    }


def _dfs_extract_plates_and_info(data: Any, foundPlates: set, infoDict: dict):
    """
    深度优先搜索 (DFS) 算法：递归遍历任意复杂的 JSON 结构，
    自动嗅探并提取出所有合法车牌与工地名称，免除硬编码字段映射。
    """
    if isinstance(data, str):
        # 智能切分：外部数据中，多个车牌可能是以中英文逗号、分号、顿号或空格拼装在一起的超长字符串
        # 我们使用正则切分出所有独立的车辆子项，确保无遗漏抓取
        parts = re.split(r"[,，;；\s、]+", data)
        for part in parts:
            cleanedVal = part.strip().upper()
            # 校验每一个拆分出的子项是否为合法车牌
            if PLATE_REGEX.match(cleanedVal):
                foundPlates.add(cleanedVal)
    elif isinstance(data, list):
        for item in data:
            _dfs_extract_plates_and_info(item, foundPlates, infoDict)
    elif isinstance(data, dict):
        for key, val in data.items():
            keyLower = key.lower()
            # 智能提取潜在的工地/企业名称
            if isinstance(val, str) and any(wk in keyLower for wk in WORKSITE_KEYS):
                valStripped = val.strip()
                if valStripped and len(valStripped) > 2 and not PLATE_REGEX.match(valStripped):
                    if "worksite" in keyLower or "enterprise" in keyLower:
                        infoDict["worksite_name"] = valStripped
                    elif "worksite_name" not in infoDict:
                        infoDict["worksite_name"] = valStripped
            
            _dfs_extract_plates_and_info(val, foundPlates, infoDict)


@app.get("/api/login/captcha")
async def login_captcha():
    targetUrl = f"{REMOTE_BASE_URL}/login/getCode"
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(targetUrl, headers=_remote_headers())
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=504,
            detail=f"获取验证码失败，请检查网络或目标系统状态: {exc}",
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"目标系统验证码接口返回 HTTP {response.status_code}",
        )

    try:
        responseData = response.json()
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="目标系统验证码接口返回的不是合法 JSON",
        )

    if not isinstance(responseData, dict) or not _is_business_success(responseData):
        raise HTTPException(
            status_code=400,
            detail=_remote_error_detail(responseData, "验证码获取失败"),
        )

    resultObj = responseData.get("result") or {}
    img = resultObj.get("img") or responseData.get("img")
    uuid = resultObj.get("uuid") or responseData.get("uuid") or ""
    if not isinstance(img, str) or not img.strip():
        raise HTTPException(
            status_code=502,
            detail="目标系统验证码接口未返回图片数据",
        )

    img = img.strip()
    if not img.startswith("data:image/"):
        img = f"data:image/jpeg;base64,{img}"

    return {
        "success": True,
        "img": img,
        "uuid": str(uuid),
    }


@app.post("/api/login/token")
async def login_token(payload: LoginTokenRequest):
    username = payload.username.strip()
    password = payload.password
    code = payload.code.strip()
    uuid = payload.uuid.strip()
    if not username or not password or not code:
        raise HTTPException(
            status_code=400,
            detail="账号、密码和验证码不能为空",
        )

    targetUrl = f"{REMOTE_BASE_URL}/login"
    loginPayload = _build_login_payload(username, password, code, uuid)
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(targetUrl, headers=_remote_headers(), json=loginPayload)
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=504,
            detail=f"登录目标系统失败，请检查网络或目标系统状态: {exc}",
        )

    if response.status_code != 200:
        raise HTTPException(
            status_code=response.status_code,
            detail=f"目标系统登录接口返回 HTTP {response.status_code}",
        )

    try:
        responseData = response.json()
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="目标系统登录接口返回的不是合法 JSON",
        )

    if not isinstance(responseData, dict) or not _is_business_success(responseData):
        raise HTTPException(
            status_code=400,
            detail=_remote_error_detail(responseData, "登录失败，请检查账号、密码或验证码"),
        )

    token = _extract_token(responseData)
    if not token:
        raise HTTPException(
            status_code=502,
            detail=_remote_error_detail(responseData, "登录成功但目标系统未返回 token"),
        )

    return {
        "success": True,
        "authtoken": token,
    }


@app.post("/api/sync-data")
async def sync_data(payload: QueryRequest):
    """
    一键同步路由：携带 authtoken 请求外部接口并用 DFS 数据提取车牌，
    然后写入本地 JSON 文件进行持久化存储。
    """
    targetUrl = f"http://ztxn.capcloud.com.cn:8080/dregs_service-dev/putOnRecords/unijz-unit-worksite/getWorksiteById?id={payload.id}&worksitetype={payload.worksitetype}"
    
    headers = {
        "Accept": "*/*",
        "Accept-Language": "zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7",
        "authtoken": payload.authtoken.strip(),
        "Content-Length": "0",
        "Host": "ztxn.capcloud.com.cn:8080",
        "Origin": "http://ztxn.capcloud.com.cn:8080",
        "Referer": "http://ztxn.capcloud.com.cn:8080/dist/index.html",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
    }
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(targetUrl, headers=headers)
            
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"目标系统返回非200状态码: {response.status_code}"
                )
                
            try:
                responseData = response.json()
                # 调试落盘：完整记录远程接口返回的真实 JSON 结构以供格式解析
                debugFile = os.path.join(BASE_DIR, "debug_response.json")
                with open(debugFile, "w", encoding="utf-8") as df:
                    json.dump(responseData, df, ensure_ascii=False, indent=2)
            except Exception:
                raise HTTPException(
                    status_code=502,
                    detail="目标系统返回的数据不是合法的 JSON 格式"
                )
                
            # 业务层防错拦截：远程官方即使业务失败（如 Token 过期）也会奇葩地返回 HTTP 200
            if isinstance(responseData, dict):
                bizSuccess = responseData.get("success")
                bizCode = responseData.get("code")
                bizMsg = responseData.get("message") or responseData.get("msg")
                
                # 如果业务显式标记 success 为 false，或者 code 不代表成功 (兼容官方系统的特有成功代码 2000)
                if bizSuccess is False or (bizCode is not None and str(bizCode) not in ("2000", "200", "0")):
                    errDetail = bizMsg or "未知业务错误"
                    # 特别捕获 Token 过期报错，给出汉化精准提示
                    if "token" in errDetail.lower() or bizCode == 6000:
                        errDetail = "当前配置的授权密钥 (authtoken) 已过期或失效，请在右上角【接口配置】中贴入最新的有效 Token！"
                    raise HTTPException(
                        status_code=400,
                        detail=f"同步失败：{errDetail}"
                    )
                
            foundPlates = set()
            infoDict = {}
            _dfs_extract_plates_and_info(responseData, foundPlates, infoDict)
            
            platesList = sorted(list(foundPlates))
            
            # 精确提取合作企业及临时合作企业数据流 (双保险提取：精确路径为主，DFS 嗅探为辅)
            resultObj = responseData.get("result") or responseData.get("data") or {}
            transports = resultObj.get("transports") or []
            tempTransports = resultObj.get("temporaryTransportChangeDTOS") or []
            worksiteName = resultObj.get("worksite", {}).get("name") or infoDict.get("worksite_name") or "未定名工地"
            
            # 写入本地数据持久化 JSON 文件
            nowStr = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            dataToSave = {
                "worksite_name": worksiteName,
                "last_updated": nowStr,
                "total_vehicles": len(platesList),
                "vehicles": platesList,
                "transports": transports,
                "temporary_transports": tempTransports
            }
            try:
                with open(DATA_FILE, "w", encoding="utf-8") as f:
                    json.dump(dataToSave, f, ensure_ascii=False, indent=2)
            except Exception as e:
                raise HTTPException(
                    status_code=500,
                    detail=f"写入本地数据文件失败: {e}"
                )
            
            # 保存接口配置到 config.json 以供计划任务使用
            try:
                config_data = {}
                if os.path.exists(CONFIG_FILE):
                    try:
                        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                            config_data = json.load(f)
                    except Exception:
                        pass
                config_data.update(payload.model_dump())
                with open(CONFIG_FILE, "w", encoding="utf-8") as f:
                    json.dump(config_data, f, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f"Warning: Failed to save config to {CONFIG_FILE}: {e}")
            
            return {
                "success": True,
                "last_updated": nowStr,
                "worksite_name": worksiteName,
                "total_vehicles": len(platesList),
                "vehicles": platesList,
                "transports": transports,
                "temporary_transports": tempTransports
            }
            
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=504,
            detail=f"请求目标系统超时或连接失败，请确认您的网络代理或目标系统是否正常运行。异常信息: {exc}"
        )


class LocalQueryRequest(BaseModel):
    plate_no: str


@app.post("/api/local-query")
async def local_query(payload: LocalQueryRequest):
    """
    离线查询路由：日常查询完全不碰外部接口，
    直接比对本地持久化 JSON 数据，零延迟响应。
    """
    plateToFind = payload.plate_no.strip().upper()
    if not os.path.exists(DATA_FILE):
        raise HTTPException(
            status_code=400,
            detail="本地尚未同步任何备案数据，请先点击“一键同步数据”按钮！"
        )
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            localData = json.load(f)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"读取本地数据失败: {e}"
        )
    
    vehicles = localData.get("vehicles", [])
    worksiteName = localData.get("worksite_name", "未命名工地")
    lastUpdated = localData.get("last_updated", "")
    
    isMatch = any(v.upper() == plateToFind for v in vehicles)
    
    return {
        "success": True,
        "is_match": isMatch,
        "plate_no": plateToFind,
        "worksite_name": worksiteName,
        "last_updated": lastUpdated,
        "total_vehicles": len(vehicles)
    }


@app.get("/api/local-data")
async def get_local_data():
    """
    获取本地全量备案车牌列表接口，供前端渲染表格。
    """
    if not os.path.exists(DATA_FILE):
        return {
            "success": False,
            "has_data": False,
            "msg": "暂无本地已同步的备案数据"
        }
    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            localData = json.load(f)
        return {
            "success": True,
            "has_data": True,
            "worksite_name": localData.get("worksite_name", "未命名工地"),
            "last_updated": localData.get("last_updated", ""),
            "total_vehicles": localData.get("total_vehicles", 0),
            "vehicles": localData.get("vehicles", []),
            "transports": localData.get("transports", []),
            "temporary_transports": localData.get("temporary_transports", [])
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"读取本地数据出错: {e}"
        )


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "plate-query-proxy"}


@app.get("/api/config")
async def get_backend_config():
    """
    获取服务器端配置信息（包含 authtoken），供前端免验证直接使用。
    """
    if not os.path.exists(CONFIG_FILE):
        return {
            "success": True,
            "authtoken": "",
            "id": "225642",
            "worksitetype": "1"
        }
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            config = json.load(f)
        return {
            "success": True,
            "authtoken": config.get("authtoken", ""),
            "id": config.get("id", "225642"),
            "worksitetype": config.get("worksitetype", "1")
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"读取服务器配置失败: {e}"
        )


@app.get("/api/public/vehicle-query")
async def public_vehicle_query(
    plate_no: Optional[str] = None,
    apikey: Optional[str] = None,
    X_API_Key: Optional[str] = Header(None)
):
    """
    对外公开/受控车牌查询接口：允许第三方系统通过车牌号查询备案信息，或者获取全部已备案的车辆及运输公司数据库。
    """
    # 1. 读取接口配置以判定是否开启及是否需要密钥校验
    api_enabled = True
    configured_key = ""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                config = json.load(f)
                api_enabled = config.get("public_api_enabled", True)
                configured_key = config.get("public_api_key", "").strip()
        except Exception:
            pass

    if not api_enabled:
        raise HTTPException(
            status_code=403,
            detail="公共查询接口已被管理员禁用。"
        )

    # 2. 校验密钥 (支持 Header 和 Query 参数)
    if configured_key:
        provided_key = apikey or X_API_Key
        if not provided_key or provided_key.strip() != configured_key:
            raise HTTPException(
                status_code=401,
                detail="API 密钥 (API Key) 无效或未提供。"
            )

    # 3. 读取本地已同步备案库 file
    if not os.path.exists(DATA_FILE):
        return {
            "success": True,
            "is_filed": False,
            "message": "本地尚未同步备案数据库，请先在控制台执行一键数据同步。"
        }

    try:
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"读取本地数据失败: {e}"
        )

    vehicles = data.get("vehicles", [])
    transports = data.get("transports", [])
    temp_transports = data.get("temporary_transports", [])

    # 4. 构建企业备案映射字典以加速反查 (将车辆与企业信息关联)
    plate_lookup = {}
    
    # 4.1 常驻备案企业
    for t in transports:
        company_name = t.get("companyname") or "未知企业"
        phone = t.get("phone") or "-"
        address = t.get("address") or "-"
        carnumbers = t.get("carnumbers", "")
        if carnumbers:
            for c in carnumbers.split(","):
                c_clean = c.strip().upper()
                if c_clean:
                    plate_lookup[c_clean] = {
                        "company_name": company_name,
                        "phone": phone,
                        "address": address,
                        "transport_type": "permanent"
                    }

    # 4.2 临时备案企业
    for t in temp_transports:
        company_name = t.get("companyName") or "未知企业"
        phone = t.get("phone") or "-"
        address = t.get("address") or "-"
        carnumbers = t.get("carnumbers", "")
        if carnumbers:
            for c in carnumbers.split(","):
                c_clean = c.strip().upper()
                if c_clean:
                    if c_clean not in plate_lookup:
                        plate_lookup[c_clean] = {
                            "company_name": company_name,
                            "phone": phone,
                            "address": address,
                            "transport_type": "temporary"
                        }

    # 5. 分流业务逻辑：根据是否传入单个车牌进行响应
    if plate_no is not None and plate_no.strip():
        # 5.1 单个车牌校验
        plate_no_clean = plate_no.strip().upper()
        is_filed = any(v.upper() == plate_no_clean for v in vehicles)
        
        if not is_filed:
            return {
                "success": True,
                "is_filed": False,
                "plate_no": plate_no_clean,
                "message": "未查询到该车牌的备案记录"
            }
            
        details = plate_lookup.get(plate_no_clean, {
            "company_name": "未知企业",
            "phone": "-",
            "address": "-",
            "transport_type": None
        })
        
        return {
            "success": True,
            "is_filed": True,
            "plate_no": plate_no_clean,
            "worksite_name": data.get("worksite_name", "未定名工地"),
            "company_name": details["company_name"],
            "phone": details["phone"],
            "address": details["address"],
            "transport_type": details["transport_type"],
            "last_updated": data.get("last_updated", "")
        }
    else:
        # 5.2 获取全量已备案车辆库
        all_filed_list = []
        for v in vehicles:
            v_upper = v.upper()
            details = plate_lookup.get(v_upper, {
                "company_name": "未知企业",
                "phone": "-",
                "address": "-",
                "transport_type": None
            })
            all_filed_list.append({
                "plate_no": v_upper,
                "company_name": details["company_name"],
                "phone": details["phone"],
                "address": details["address"],
                "transport_type": details["transport_type"]
            })
            
        return {
            "success": True,
            "worksite_name": data.get("worksite_name", "未定名工地"),
            "total_vehicles": len(all_filed_list),
            "last_updated": data.get("last_updated", ""),
            "vehicles": all_filed_list
        }


@app.post("/api/waybills")
async def query_waybills(payload: WaybillQueryRequest):
    """
    运单查询代理接口：转发运单检索请求至目标系统
    """
    print(f"=== WAYBILL QUERY DIAGNOSTIC LOG ===")
    print(f"Payload received: {payload.model_dump()}")
    targetUrl = f"{REMOTE_BASE_URL}/constructionSite/record-waybill/pageList"
    headers = _remote_headers(payload.authtoken.strip())
    body = {
        "page": payload.page,
        "limit": payload.limit,
        "id": payload.id.strip(),
        "state": payload.state.strip(),
        "starTime": payload.starTime.strip(),
        "endTime": payload.endTime.strip(),
        "code": payload.code.strip(),
        "overloadRatio": payload.overloadRatio.strip(),
        "absorptivename": payload.absorptivename.strip(),
        "type": payload.type
    }
    print(f"Forwarding body: {body}")
    
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(targetUrl, headers=headers, json=body)
            if response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"目标系统返回非200状态码: {response.status_code}"
                )
            try:
                responseData = response.json()
                return responseData
            except Exception:
                raise HTTPException(
                    status_code=502,
                    detail="目标系统返回的数据不是合法的 JSON 格式"
                )
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=504,
            detail=f"请求目标系统超时或连接失败，异常信息: {exc}"
        )


ABSORPTIVE_QUOTAS_FILE = os.path.abspath(os.path.join(BASE_DIR, "absorptive_quotas.json"))

class AbsorptiveQuotaPayload(BaseModel):
    name: str
    quota: float

class AbsorptiveMonthlyStatsRequest(BaseModel):
    authtoken: str
    absorptivename: str = ""
    year: int = 2026
    startMonth: int = 1
    endMonth: int = 12

def _load_absorptive_quotas() -> Dict[str, float]:
    if os.path.exists(ABSORPTIVE_QUOTAS_FILE):
        try:
            with open(ABSORPTIVE_QUOTAS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "首钢": 50000.0,
        "默认消纳场": 100000.0
    }

def _save_absorptive_quotas(quotas: Dict[str, float]):
    try:
        with open(ABSORPTIVE_QUOTAS_FILE, "w", encoding="utf-8") as f:
            json.dump(quotas, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving absorptive quotas: {e}")

@app.get("/api/absorptive/quotas")
async def get_absorptive_quotas():
    return {"success": True, "quotas": _load_absorptive_quotas()}

@app.post("/api/absorptive/quotas")
async def set_absorptive_quota(payload: AbsorptiveQuotaPayload):
    name = payload.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="土点名称不能为空")
    quotas = _load_absorptive_quotas()
    quotas[name] = max(0.0, payload.quota)
    _save_absorptive_quotas(quotas)
    return {"success": True, "name": name, "quota": quotas[name]}

@app.post("/api/absorptive/monthly-stats")
async def query_absorptive_monthly_stats(payload: AbsorptiveMonthlyStatsRequest):
    import calendar
    authtoken = payload.authtoken.strip()
    absorptivename = payload.absorptivename.strip()
    year = payload.year
    start_month = max(1, min(12, payload.startMonth))
    end_month = max(start_month, min(12, payload.endMonth))
    
    if not authtoken:
        raise HTTPException(status_code=400, detail="authtoken 授权密钥不能为空！")
        
    targetUrl = f"{REMOTE_BASE_URL}/constructionSite/record-waybill/pageList"
    headers = _remote_headers(authtoken)
    
    monthly_results = []
    used_total = 0.0
    total_trips = 0
    
    from datetime import date
    today_str = date.today().strftime("%Y-%m-%d")

    async with httpx.AsyncClient(timeout=20.0) as client:
        for month in range(start_month, end_month + 1):
            _, last_day = calendar.monthrange(year, month)
            starTime = f"{year}-{month:02d}-01"
            endTime = f"{year}-{month:02d}-{last_day:02d}"
            
            if starTime > today_str:
                monthly_results.append({
                    "month": f"{year}-{month:02d}",
                    "month_name": f"{month}月",
                    "starTime": starTime,
                    "endTime": endTime,
                    "count": 0.0,
                    "trips": 0
                })
                continue
                
            if endTime > today_str:
                endTime = today_str
            
            body = {
                "page": 1,
                "limit": 100,
                "id": "",
                "state": "",
                "starTime": starTime,
                "endTime": endTime,
                "code": "",
                "overloadRatio": "",
                "absorptivename": absorptivename,
                "type": 1
            }
            
            month_count = 0.0
            month_trips = 0
            
            try:
                response = await client.post(targetUrl, headers=headers, json=body)
                if response.status_code == 200:
                    res_data = response.json()
                    if isinstance(res_data, dict):
                        res_obj = res_data.get("result")
                        if isinstance(res_obj, dict):
                            count_val = res_obj.get("count")
                            total_val = res_obj.get("total")
                            if count_val is not None and float(count_val) > 0:
                                month_count = float(count_val)
                                month_trips = int(total_val or 0)
                            else:
                                records = res_obj.get("records") or res_obj.get("rows") or []
                                matching = [
                                    r for r in records
                                    if isinstance(r, dict) and (
                                        not absorptivename or 
                                        absorptivename.lower() in str(r.get("absorptivename") or "").lower() or
                                        absorptivename.lower() in str(r.get("arriveplace") or "").lower()
                                    )
                                ]
                                month_trips = len(matching)
                                for r in matching:
                                    try:
                                        num_val = float(r.get("transportinoutnum") or 0)
                                        month_count += num_val
                                    except (ValueError, TypeError):
                                        pass
            except Exception as e:
                print(f"Error querying month {year}-{month:02d}: {e}")
                
            used_total += month_count
            total_trips += month_trips
            
            monthly_results.append({
                "month": f"{year}-{month:02d}",
                "month_name": f"{month}月",
                "starTime": starTime,
                "endTime": endTime,
                "count": round(month_count, 2),
                "trips": month_trips
            })
            
    quotas = _load_absorptive_quotas()
    matched_quota = quotas.get(absorptivename)
    if matched_quota is None:
        for qk, qv in quotas.items():
            if qk in absorptivename or absorptivename in qk:
                matched_quota = qv
                break
    if matched_quota is None:
        matched_quota = 50000.0
        
    remaining_capacity = max(0.0, round(matched_quota - used_total, 2))
    usage_percentage = round((used_total / matched_quota * 100), 2) if matched_quota > 0 else 0.0
    
    return {
        "success": True,
        "year": year,
        "absorptivename": absorptivename or "全量土点",
        "total_quota": matched_quota,
        "used_total": round(used_total, 2),
        "remaining_capacity": remaining_capacity,
        "usage_percentage": usage_percentage,
        "total_trips": total_trips,
        "monthly_data": monthly_results
    }


DEFAULT_ABSORPTIVE_SITES_CONFIG = [
    {"name": "妙峰绿水资源化处置厂", "alias": ["妙峰", "绿水"], "total_quota": 10000.0, "expire_date": "2026/12/13"},
    {"name": "石景山区北辛安路", "alias": ["北辛安"], "total_quota": 127750.0, "expire_date": "2026/7/30"},
    {"name": "石景山区西黄村棚户", "alias": ["西黄村"], "total_quota": 30000.0, "expire_date": "2026/8/28"},
    {"name": "石景山区首钢园区东南", "alias": ["首钢"], "total_quota": 30000.0, "expire_date": "2026/8/28"},
    {"name": "首建恒纪建筑垃圾资源化处置场", "alias": ["首建恒纪", "恒纪"], "total_quota": 260000.0, "expire_date": "2026/12/13"},
    {"name": "国盛通顺临时资源化处置场", "alias": ["国盛通顺"], "total_quota": 350000.0, "expire_date": "2026/12/13"},
    {"name": "北京石宇环保科技有限公司临时资源化处置场", "alias": ["石宇环保", "石宇"], "total_quota": 50000.0, "expire_date": "2026/12/13"}
]

ABSORPTIVE_CONFIG_FILE = os.path.abspath(os.path.join(BASE_DIR, "absorptive_sites_config.json"))
ABSORPTIVE_MATRIX_CACHE_FILE = os.path.abspath(os.path.join(BASE_DIR, "absorptive_matrix_cache.json"))

class AbsorptiveMatrixStatsRequest(BaseModel):
    authtoken: str
    absorptivename: str = ""
    year: int = 2026
    startMonth: int = 4
    endMonth: int = 8
    totalProjectVolume: float = 938164.0

def _load_sites_config():
    if os.path.exists(ABSORPTIVE_CONFIG_FILE):
        try:
            with open(ABSORPTIVE_CONFIG_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "sites": DEFAULT_ABSORPTIVE_SITES_CONFIG,
        "total_project_volume": 938164.0
    }

def _save_sites_config(data):
    try:
        with open(ABSORPTIVE_CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving sites config: {e}")

def _normalize_expire_date(value):
    if not value:
        return "-"
    text = str(value).strip().replace("-", "/")
    match = re.search(r"(\d{4})/(\d{1,2})/(\d{1,2})", text)
    return f"{int(match.group(1)):04d}/{int(match.group(2)):02d}/{int(match.group(3)):02d}" if match else "-"

def _is_expired_site(site):
    from datetime import date
    expire = _normalize_expire_date(site.get("expire_date"))
    if expire == "-":
        return False
    try:
        year, month, day = (int(part) for part in expire.split("/"))
        return date(year, month, day) < date.today()
    except Exception:
        return False

async def _resolve_current_sites(authtoken: str):
    """合并远端当前土点：新增自动加行，过期不进入展示。"""
    config_data = _load_sites_config()
    configured = config_data.get("sites", DEFAULT_ABSORPTIVE_SITES_CONFIG)
    by_name = {str(site.get("name", "")).strip(): site for site in configured if site.get("name")}
    try:
        runtime_config = {}
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                runtime_config = json.load(f)
        worksite_id = str(runtime_config.get("id", "")).strip()
        worksite_type = str(runtime_config.get("worksitetype", "1")).strip() or "1"
        if not worksite_id or not authtoken:
            raise RuntimeError("missing worksite config")
        target = f"{REMOTE_BASE_URL}/putOnRecords/unijz-unit-worksite/getWorksiteById?id={worksite_id}&worksitetype={worksite_type}"
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.post(target, headers=_remote_headers(authtoken))
        if response.status_code != 200:
            raise RuntimeError(f"remote status {response.status_code}")
        payload = response.json()
        result = payload.get("result") or payload.get("data") or {}
        remote_sites = result.get("absorptives") or []
        worksite = result.get("worksite") or {}
        project_expire = _normalize_expire_date(worksite.get("cleanenddate") or worksite.get("cleanEndDate") or worksite.get("contractEndDate"))
        merged = []
        for remote in remote_sites:
            if not isinstance(remote, dict) or str(remote.get("isdelete", "0")) == "1":
                continue
            name = str(remote.get("absorptivenamelist") or remote.get("absorptivename") or remote.get("name") or "").strip()
            if not name:
                continue
            site = dict(by_name.get(name, {}))
            site["name"] = name
            site.setdefault("alias", [])
            if "total_quota" not in site:
                try:
                    site["total_quota"] = float(remote.get("rubbishcount") or remote.get("quota") or 0)
                except (TypeError, ValueError):
                    site["total_quota"] = 0.0
            if not site.get("expire_date") or site.get("expire_date") == "-":
                site["expire_date"] = project_expire
            merged.append(site)
        if merged:
            if merged != configured:
                _save_sites_config({**config_data, "sites": merged})
            return [site for site in merged if not _is_expired_site(site)]
    except Exception as exc:
        print(f"Error resolving absorptive sites: {exc}")
    return [site for site in configured if not _is_expired_site(site)]

def _load_matrix_cache():
    if os.path.exists(ABSORPTIVE_MATRIX_CACHE_FILE):
        try:
            with open(ABSORPTIVE_MATRIX_CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return None

def _save_matrix_cache(data):
    try:
        with open(ABSORPTIVE_MATRIX_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving matrix cache: {e}")

def _sort_matrix_by_expiration(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    根据到期时间排序：
    1. 快到期（未过期）的排在最前面，按到期时间升序（越早到期越排前）；
    2. 已经过期的排在最后面；
    3. 未设置到期日期的排在末尾。
    """
    from datetime import date
    today = date.today()

    def get_sort_key(row):
        exp_str = str(row.get("expire_date", "") or "").strip()
        try:
            parts = exp_str.replace("-", "/").split("/")
            if len(parts) == 3:
                exp_d = date(int(parts[0]), int(parts[1]), int(parts[2]))
                if exp_d >= today:
                    # 未过期/有效：优先级 0，越早到期越排在前面
                    return (0, exp_d)
                else:
                    # 已过期：优先级 1，排在最后面
                    return (1, exp_d)
        except Exception:
            pass
        return (2, date.max)

    return sorted(rows, key=get_sort_key)

@app.get("/api/absorptive/sites-config")
async def get_sites_config():
    return {"success": True, "data": _load_sites_config()}

@app.post("/api/absorptive/sites-config")
async def update_sites_config(payload: Dict[str, Any] = Body(...)):
    _save_sites_config(payload)
    return {"success": True}

@app.get("/api/absorptive/local-matrix")
async def get_local_matrix_cache():
    """
    获取本地已持久化保存的土点矩阵数据快照，供前端首屏瞬时秒开展示，避免每次重复调用接口。
    """
    from datetime import date
    curr_month = date.today().month
    default_months = [f"{m}月" for m in range(4, max(4, curr_month) + 1)]

    cache = _load_matrix_cache()
    if cache and cache.get("matrix"):
        sorted_matrix = _sort_matrix_by_expiration([row for row in cache.get("matrix", []) if not _is_expired_site(row)])
        return {
            "success": True,
            "has_data": True,
            "last_updated": cache.get("last_updated", ""),
            "year": cache.get("year", 2026),
            "months": cache.get("months", default_months),
            "matrix": sorted_matrix,
            "summary": cache.get("summary", {})
        }
    
    # 暂无缓存时返回预置模版（方量为0），页面即刻成型无需白屏
    config_data = _load_sites_config()
    sites_list = [site for site in config_data.get("sites", DEFAULT_ABSORPTIVE_SITES_CONFIG) if not _is_expired_site(site)]
    total_project_volume = float(config_data.get("total_project_volume", 938164.0))
    months = default_months
    default_rows = []
    total_handled_capacity = 0.0
    for s in sites_list:
        q = float(s.get("total_quota") or 0.0)
        total_handled_capacity += q
        default_rows.append({
            "name": s["name"],
            "monthly": { m: 0.0 for m in months },
            "total_consumed": 0.0,
            "total_quota": q,
            "remaining": q,
            "expire_date": s.get("expire_date", "-")
        })

    sorted_default_rows = _sort_matrix_by_expiration(default_rows)

    return {
        "success": True,
        "has_data": False,
        "last_updated": "",
        "year": 2026,
        "months": months,
        "matrix": sorted_default_rows,
        "summary": {
            "total_project_volume": round(total_project_volume, 2),
            "handled_capacity": round(total_handled_capacity, 2),
            "unhandled_volume": round(max(0.0, total_project_volume - total_handled_capacity), 2),
            "total_consumed": 0.0,
            "total_remaining": round(total_handled_capacity, 2)
        }
    }

@app.post("/api/absorptive/matrix-stats")
async def query_absorptive_matrix_stats(payload: AbsorptiveMatrixStatsRequest):
    import calendar
    from datetime import date, datetime

    authtoken = payload.authtoken.strip()
    filter_site = payload.absorptivename.strip()
    year = payload.year
    start_month = max(1, min(12, payload.startMonth))
    end_month = max(start_month, min(12, payload.endMonth))
    
    if not authtoken:
        raise HTTPException(status_code=400, detail="authtoken 授权密钥不能为空！")
        
    config_data = _load_sites_config()
    sites_list = await _resolve_current_sites(authtoken)
    total_project_volume = float(payload.totalProjectVolume or config_data.get("total_project_volume", 938164.0))

    targetUrl = f"{REMOTE_BASE_URL}/constructionSite/record-waybill/pageList"
    headers = _remote_headers(authtoken)
    today_str = date.today().strftime("%Y-%m-%d")

    site_monthly_map = { site["name"]: { month: 0.0 for month in range(start_month, end_month + 1) } for site in sites_list }

    async with httpx.AsyncClient(timeout=30.0) as client:
        for month in range(start_month, end_month + 1):
            _, last_day = calendar.monthrange(year, month)
            starTime = f"{year}-{month:02d}-01"
            endTime = f"{year}-{month:02d}-{last_day:02d}"
            
            if starTime > today_str:
                continue
            if endTime > today_str:
                endTime = today_str

            page = 1
            limit = 1000
            while True:
                body = {
                    "page": page,
                    "limit": limit,
                    "id": "",
                    "state": "",
                    "starTime": starTime,
                    "endTime": endTime,
                    "code": "",
                    "overloadRatio": "",
                    "absorptivename": "",
                    "type": 1
                }

                try:
                    response = await client.post(targetUrl, headers=headers, json=body)
                    if response.status_code == 200:
                        res_data = response.json()
                        if isinstance(res_data, dict):
                            res_obj = res_data.get("result") or {}
                            records = res_obj.get("rows") or res_obj.get("records") or []
                            total_records = res_obj.get("total") or 0
                            
                            for r in records:
                                if not isinstance(r, dict):
                                    continue
                                abs_name = str(r.get("absorptivename") or r.get("arriveplace") or "")
                                vol = 0.0
                                try:
                                    vol = float(r.get("transportinoutnum") or 0)
                                except (ValueError, TypeError):
                                    pass
                                
                                for site in sites_list:
                                    s_name = site["name"]
                                    aliases = site.get("alias", [])
                                    matched = (s_name in abs_name or abs_name in s_name) or any(a in abs_name for a in aliases if a)
                                    if matched:
                                        site_monthly_map[s_name][month] += vol
                                        break
                                        
                            if page * limit >= total_records or not records:
                                break
                            page += 1
                        else:
                            break
                    else:
                        break
                except Exception as e:
                    print(f"Error querying matrix month {year}-{month:02d} page {page}: {e}")
                    break

    all_matrix_rows = []
    total_handled_capacity = 0.0
    total_consumed_all = 0.0

    for site in sites_list:
        s_name = site["name"]
        quota = float(site.get("total_quota") or 0.0)
        expire_date = site.get("expire_date", "-")
        
        m_counts = {}
        site_total_consumed = 0.0
        for m in range(start_month, end_month + 1):
            val = round(site_monthly_map[s_name][m], 2)
            m_counts[f"{m}月"] = val
            site_total_consumed += val

        site_total_consumed = round(site_total_consumed, 2)
        remaining = round(max(0.0, quota - site_total_consumed), 2)
        
        total_handled_capacity += quota
        total_consumed_all += site_total_consumed

        all_matrix_rows.append({
            "name": s_name,
            "monthly": m_counts,
            "total_consumed": site_total_consumed,
            "total_quota": quota,
            "remaining": remaining,
            "expire_date": expire_date
        })

    # 根据到期时间排序：快到期的排在前面，已过期的排在最后面
    all_matrix_rows = _sort_matrix_by_expiration([row for row in all_matrix_rows if not _is_expired_site(row)])

    unhandled_volume = round(max(0.0, total_project_volume - total_handled_capacity), 2)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    summary_data = {
        "total_project_volume": round(total_project_volume, 2),
        "handled_capacity": round(total_handled_capacity, 2),
        "unhandled_volume": unhandled_volume,
        "total_consumed": round(total_consumed_all, 2),
        "total_remaining": round(max(0.0, total_handled_capacity - total_consumed_all), 2)
    }

    # 自动持久化全量缓存（当查询全部土点时保存完整快照）
    if not filter_site or filter_site == "全部土点":
        _save_matrix_cache({
            "last_updated": now_str,
            "year": year,
            "months": [f"{m}月" for m in range(start_month, end_month + 1)],
            "matrix": all_matrix_rows,
            "summary": summary_data
        })

    display_rows = all_matrix_rows
    # Optional filtering by specific land point name if provided
    if filter_site and filter_site != "全部土点":
        display_rows = [
            r for r in all_matrix_rows
            if filter_site.lower() in r["name"].lower() or r["name"].lower() in filter_site.lower()
        ]

    return {
        "success": True,
        "has_data": True,
        "last_updated": now_str,
        "year": year,
        "months": [f"{m}月" for m in range(start_month, end_month + 1)],
        "matrix": display_rows,
        "summary": summary_data
    }


QR_DATA_FILE = os.path.abspath(os.path.join(BASE_DIR, "qr_data.json"))

class QrConfigPayload(BaseModel):
    vehicles: List[Dict[str, Any]]
    templates: Dict[str, str]

@app.get("/api/qr-helper/config")
async def get_qr_config():
    if not os.path.exists(QR_DATA_FILE):
        return {
            "success": True,
            "vehicles": [],
            "templates": {
                "worksite": "http://ztxn.capcloud.com.cn:8080/dist/index.html#/scan/worksite?plate={plate}",
                "dump": "http://ztxn.capcloud.com.cn:8080/dist/index.html#/scan/dump?plate={plate}"
            }
        }
    try:
        with open(QR_DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "success": True,
            "vehicles": data.get("vehicles", []),
            "templates": data.get("templates", {})
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"读取二维码助手配置失败: {e}"
        )

@app.post("/api/qr-helper/config")
async def save_qr_config(payload: QrConfigPayload):
    try:
        data_to_save = {
            "vehicles": payload.vehicles,
            "templates": payload.templates
        }
        with open(QR_DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data_to_save, f, ensure_ascii=False, indent=2)
        return {"success": True}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"保存二维码助手配置失败: {e}"
        )


class AdminConfigPayload(BaseModel):
    volc_ak: str
    volc_sk: str

class SystemConfigPayload(BaseModel):
    authtoken: str
    id: str
    worksitetype: str

class FileVehiclePayload(BaseModel):
    plate: str
    company: str
    original_plate: Optional[str] = None

class DeletePendingPayload(BaseModel):
    plate: str

class UpdatePendingPayload(BaseModel):
    original_plate: str
    plate: str
    company: str

class UnfileVehiclePayload(BaseModel):
    plate: str
    company: str

PENDING_FILE = os.path.abspath(os.path.join(BASE_DIR, "pending_filing.json"))

def load_pending_vehicles():
    if not os.path.exists(PENDING_FILE):
        return []
    try:
        with open(PENDING_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("pending_vehicles", [])
    except Exception:
        return []

def save_pending_vehicles(vehicles):
    try:
        with open(PENDING_FILE, "w", encoding="utf-8") as f:
            json.dump({"pending_vehicles": vehicles}, f, ensure_ascii=False, indent=2)
    except Exception as e:
        print(f"Error saving pending vehicles: {e}")

def extract_ocr_info(ocr_response_data):
    text_lines = []
    result = ocr_response_data.get("Result", {})
    if "ocr_details" in result:
        for detail in result["ocr_details"]:
            if "text" in detail:
                text_lines.append(detail["text"].strip())
    elif "texts" in result:
        text_lines = [t.strip() for t in result["texts"] if isinstance(t, str)]
    elif isinstance(result, list):
        for item in result:
            if isinstance(item, dict) and "text" in item:
                text_lines.append(item["text"].strip())
                
    if not text_lines:
        def find_text_keys(obj):
            lines = []
            if isinstance(obj, dict):
                for k, v in obj.items():
                    if k == "text" and isinstance(v, str):
                        lines.append(v.strip())
                    else:
                        lines.extend(find_text_keys(v))
            elif isinstance(obj, list):
                for item in obj:
                    lines.extend(find_text_keys(item))
            return lines
        text_lines = find_text_keys(ocr_response_data)

    # Match standard plates and new energy plates
    plate_pattern = re.compile(r'[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9]{5,6}')
    
    plate = None
    company = None
    
    for line in text_lines:
        cleaned = line.replace(" ", "").replace("-", "").replace(":", "").replace("：", "")
        match = plate_pattern.search(cleaned)
        if match and not plate:
            plate = match.group(0)
            
        if ("公司" in cleaned or "集团" in cleaned or "运输队" in cleaned or "运输部" in cleaned) and not company:
            if cleaned not in ("公司名称", "运输单位", "运输公司", "建设单位", "消纳单位"):
                company = cleaned
                
    return plate, company

@app.get("/admin")
async def get_admin_page():
    from fastapi.responses import FileResponse
    admin_path = os.path.join(FRONTEND_DIR, "admin.html")
    if os.path.exists(admin_path):
        return FileResponse(admin_path)
    raise HTTPException(status_code=404, detail="Admin page not found")

@app.get("/api/admin/config")
async def get_admin_config():
    if not os.path.exists(CONFIG_FILE):
        return {"success": True, "volc_ak": DEFAULT_VOLC_KEY, "volc_sk": DEFAULT_VOLC_KEY}
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            config = json.load(f)
        return {
            "success": True,
            "volc_ak": config.get("volc_ak", "") or DEFAULT_VOLC_KEY,
            "volc_sk": config.get("volc_sk", "") or DEFAULT_VOLC_KEY
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取配置失败: {e}")

@app.post("/api/admin/config")
async def save_admin_config(payload: AdminConfigPayload):
    try:
        config = {}
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                config = json.load(f)
        config["volc_ak"] = payload.volc_ak.strip()
        config["volc_sk"] = payload.volc_sk.strip()
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存配置失败: {e}")

@app.post("/api/admin/system-config")
async def save_system_config(payload: SystemConfigPayload):
    try:
        config = {}
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                config = json.load(f)
        config["authtoken"] = payload.authtoken.strip()
        config["id"] = payload.id.strip()
        config["worksitetype"] = payload.worksitetype.strip()
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存系统配置失败: {e}")


@app.get("/api/admin/public-api-config")
async def get_public_api_config():
    """
    获取外部查询接口的配置信息 (是否启用、当前密钥)
    """
    if not os.path.exists(CONFIG_FILE):
        return {
            "success": True,
            "public_api_enabled": True,
            "public_api_key": ""
        }
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            config = json.load(f)
        return {
            "success": True,
            "public_api_enabled": config.get("public_api_enabled", True),
            "public_api_key": config.get("public_api_key", "")
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"读取外部 API 配置失败: {e}"
        )


@app.post("/api/admin/public-api-config")
async def save_public_api_config(payload: PublicApiConfigPayload):
    """
    保存外部查询接口的配置信息
    """
    try:
        config = {}
        if os.path.exists(CONFIG_FILE):
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                config = json.load(f)
        config["public_api_enabled"] = payload.public_api_enabled
        config["public_api_key"] = payload.public_api_key.strip()
        with open(CONFIG_FILE, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        return {"success": True}
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"保存外部 API 配置失败: {e}"
        )


from fastapi import UploadFile, File

@app.post("/api/admin/ocr-waybill")
async def ocr_waybill(files: List[UploadFile] = File(...)):
    import asyncio
    volc_ak = DEFAULT_VOLC_KEY
    volc_sk = DEFAULT_VOLC_KEY
    
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r", encoding="utf-8") as f:
                config = json.load(f)
            volc_ak = config.get("volc_ak", "").strip() or DEFAULT_VOLC_KEY
            volc_sk = config.get("volc_sk", "").strip() or DEFAULT_VOLC_KEY
        except Exception:
            pass
    
    if not volc_ak or not volc_sk:
        raise HTTPException(status_code=400, detail="火山引擎 Access Key (AK) 或 Secret Key (SK) 不能为空！")
    
    is_ark = volc_ak.startswith("ark-") or volc_sk.startswith("ark-")
    ark_api_key = volc_ak if volc_ak.startswith("ark-") else volc_sk
    
    visual_service = None
    if not is_ark:
        from volcengine.visual.VisualService import VisualService
        visual_service = VisualService()
        visual_service.set_ak(volc_ak)
        visual_service.set_sk(volc_sk)
        
    import base64
    
    filed_vehicles = []
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                filed_vehicles = json.load(f).get("vehicles", [])
        except Exception:
            pass
            
    pending_list = load_pending_vehicles()
    
    async def process_single_file(file):
        try:
            contents = await file.read()
            base64_data = base64.b64encode(contents).decode('utf-8')
            
            plate = None
            company = None
            
            if is_ark:
                ext = file.filename.split(".")[-1].lower()
                mime_type = "image/png"
                if ext in ("jpg", "jpeg"):
                    mime_type = "image/jpeg"
                elif ext == "webp":
                    mime_type = "image/webp"
                
                base64_data_url = f"data:{mime_type};base64,{base64_data}"
                headers = {
                    "Authorization": f"Bearer {ark_api_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": "doubao-seed-2-0-pro-260215",
                    "input": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "input_image",
                                    "image_url": base64_data_url
                                },
                                {
                                    "type": "input_text",
                                    "text": "提取图片中的文字信息，识别并提取车牌号和运输企业名称。必须只以JSON对象形式返回，无需包含任何解释或markdown标记。格式例如：{\"plate\": \"车牌号\", \"company\": \"运输公司\"}。如果不存在，填空字符串。"
                                }
                            ]
                        }
                    ]
                }
                
                async with httpx.AsyncClient(timeout=30.0) as client:
                    r = await client.post("https://ark.cn-beijing.volces.com/api/v3/responses", headers=headers, json=payload)
                    if r.status_code != 200:
                        try:
                            err_detail = r.json().get("error", {}).get("message", "未知错误")
                        except Exception:
                            err_detail = r.text
                        return {
                            "filename": file.filename,
                            "success": False,
                            "msg": f"方舟 API 报错: {err_detail}"
                        }
                    
                    data = r.json()
                    text = ""
                    for out in data.get("output", []):
                        if out.get("type") == "message" and out.get("role") == "assistant":
                            for item in out.get("content", []):
                                if item.get("type") == "output_text":
                                    text = item.get("text", "")
                                    
                    # Log raw text response for debugging
                    try:
                        log_file = os.path.abspath(os.path.join(BASE_DIR, "ocr_response.log"))
                        with open(log_file, "a", encoding="utf-8") as lf:
                            lf.write(f"=== {datetime.now()} File: {file.filename} ===\n")
                            lf.write(text + "\n\n")
                    except Exception:
                        pass

                    # Parse extracted JSON using robust regex search
                    try:
                        json_match = re.search(r'\{.*\}', text, re.DOTALL)
                        if json_match:
                            cleaned_text = json_match.group(0)
                            obj = json.loads(cleaned_text)
                            plate = obj.get("plate", "").strip().upper()
                            company = obj.get("company", "").strip()
                    except Exception:
                        pass
                    
                    # Regex fallback
                    if not plate:
                        text_upper = text.upper()
                        plate_pattern = re.compile(r'[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼][A-Z][A-Z0-9]{5,6}')
                        match = plate_pattern.search(text_upper)
                        if match:
                            plate = match.group(0)
                    if not company:
                        negations = ("没有", "未找到", "找不到", "无法", "未提及", "不存在", "示例", "例如")
                        for line in text.splitlines():
                            cleaned = line.replace(" ", "").replace("-", "").replace(":", "").replace("：", "").replace('"', '').replace("'", "")
                            if ("公司" in cleaned or "集团" in cleaned or "运输队" in cleaned or "运输部" in cleaned) and len(cleaned) > 2:
                                if not any(neg in cleaned for neg in negations):
                                    for key in ("company", "name", "enterprise", "运输公司", "公司名称", "运输单位", "建设单位", "消纳单位"):
                                        if cleaned.lower().startswith(key.lower()):
                                            cleaned = cleaned[len(key):].lstrip('",:： ')
                                    cleaned = cleaned.strip('",:： {}[]')
                                    if cleaned and 2 < len(cleaned) < 30:
                                        company = cleaned
                                        break
            else:
                form = {"image_base64": base64_data}
                resp = await asyncio.to_thread(visual_service.ocr_normal, form)
                
                # Check for error in response
                if isinstance(resp, dict) and "ResponseMetadata" in resp:
                    metadata = resp["ResponseMetadata"]
                    if "Error" in metadata:
                        error_info = metadata["Error"]
                        err_msg = error_info.get("Message", "未知接口错误")
                        return {
                            "filename": file.filename,
                            "success": False,
                            "msg": f"接口报错: {err_msg}"
                        }
                        
                plate, company = extract_ocr_info(resp)
                
            if not plate:
                return {
                    "filename": file.filename,
                    "success": False,
                    "msg": "未识别到车牌号"
                }
                
            plate = plate.upper()
            company = company or "未知企业"
            
            is_filed = any(v.upper() == plate for v in filed_vehicles)
            status = "filed" if is_filed else "pending"
            
            return {
                "filename": file.filename,
                "success": True,
                "plate": plate,
                "company": company,
                "status": status,
                "needs_pending_append": not is_filed
            }
            
        except Exception as e:
            return {
                "filename": file.filename,
                "success": False,
                "msg": f"识别出错: {e}"
            }

    tasks = [process_single_file(file) for file in files]
    completed_results = await asyncio.gather(*tasks)
    
    results = []
    for res in completed_results:
        if res.get("success") and res.get("needs_pending_append"):
            plate = res["plate"]
            company = res["company"]
            if not any(item["plate"].upper() == plate for item in pending_list):
                pending_list.append({
                    "plate": plate,
                    "company": company,
                    "status": "pending",
                    "added_time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                    "source": res["filename"]
                })
        
        # Clean up temporary field
        if "needs_pending_append" in res:
            del res["needs_pending_append"]
            
        results.append(res)
        
    save_pending_vehicles(pending_list)
    return {"success": True, "results": results}

@app.get("/api/admin/pending")
async def get_pending_vehicles():
    pending_list = load_pending_vehicles()
    
    # Load currently filed vehicles to re-match and filter
    filed_vehicles = []
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                filed_vehicles = json.load(f).get("vehicles", [])
        except Exception:
            pass
            
    filed_set = {v.strip().upper() for v in filed_vehicles}
    
    # Exclude already-filed vehicles
    unfiled_pending = [item for item in pending_list if item.get("plate", "").strip().upper() not in filed_set]
    
    # Save the cleaned list back to file if changes occurred
    if len(unfiled_pending) != len(pending_list):
        save_pending_vehicles(unfiled_pending)
        
    return {"success": True, "pending_vehicles": unfiled_pending}

@app.post("/api/admin/file-vehicle")
async def file_vehicle(payload: FileVehiclePayload):
    plate = payload.plate.strip().upper()
    company = payload.company.strip()
    original_plate = payload.original_plate.strip().upper() if payload.original_plate else plate
    
    if not plate:
        raise HTTPException(status_code=400, detail="车牌号不能为空！")
        
    if not os.path.exists(DATA_FILE):
        data = {
            "worksite_name": "手动备案工地",
            "last_updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "total_vehicles": 0,
            "vehicles": [],
            "transports": [],
            "temporary_transports": []
        }
    else:
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"读取本地备案库失败: {e}")
            
    vehicles = data.get("vehicles", [])
    if not any(v.upper() == plate for v in vehicles):
        vehicles.append(plate)
        data["vehicles"] = vehicles
        data["total_vehicles"] = len(vehicles)
        
    if company and company != "未知企业":
        transports = data.get("transports", [])
        found_transport = False
        for t in transports:
            if t.get("companyname") == company:
                carnumbers = t.get("carnumbers", "")
                if carnumbers:
                    car_list = [c.strip().upper() for c in carnumbers.split(",")]
                    if plate not in car_list:
                        t["carnumbers"] = carnumbers + "," + plate
                        t["carcount"] = str(int(t.get("carcount", "0")) + 1)
                else:
                    t["carnumbers"] = plate
                    t["carcount"] = "1"
                found_transport = True
                break
                
        if not found_transport:
            temp_transports = data.get("temporary_transports", [])
            for t in temp_transports:
                if t.get("companyName") == company:
                    carnumbers = t.get("carnumbers", "")
                    if carnumbers:
                        car_list = [c.strip().upper() for c in carnumbers.split(",")]
                        if plate not in car_list:
                            t["carnumbers"] = carnumbers + "," + plate
                            t["carcount"] = t.get("carcount", 0) + 1
                    else:
                        t["carnumbers"] = plate
                        t["carcount"] = 1
                    found_transport = True
                    break
                    
        if not found_transport:
            temp_transports = data.get("temporary_transports", [])
            temp_transports.append({
                "id": str(int(datetime.now().timestamp())),
                "companyId": str(int(datetime.now().timestamp())),
                "companyName": company,
                "address": "后台手动导入",
                "legalRep": "管理员",
                "phone": "-",
                "carcount": 1,
                "carnumbers": plate,
                "startDate": datetime.now().strftime("%Y-%m-%d"),
                "endDate": "2026-12-31"
            })
            data["temporary_transports"] = temp_transports
            
    try:
        with open(DATA_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"保存备案库失败: {e}")
        
    pending_list = load_pending_vehicles()
    found_in_pending = False
    for item in pending_list:
        if item["plate"].upper() == original_plate:
            item["plate"] = plate
            item["company"] = company
            item["status"] = "filed"
            found_in_pending = True
            break
            
    if not found_in_pending:
        for item in pending_list:
            if item["plate"].upper() == plate:
                item["status"] = "filed"
                break
            
    save_pending_vehicles(pending_list)
    return {"success": True}

@app.post("/api/admin/delete-pending")
async def delete_pending(payload: DeletePendingPayload):
    plate = payload.plate.strip().upper()
    if not plate:
        raise HTTPException(status_code=400, detail="车牌号不能为空！")
        
    pending_list = load_pending_vehicles()
    updated_list = [item for item in pending_list if item["plate"].upper() != plate]
    save_pending_vehicles(updated_list)
    return {"success": True}

@app.post("/api/admin/update-pending")
async def update_pending(payload: UpdatePendingPayload):
    original_plate = payload.original_plate.strip().upper()
    plate = payload.plate.strip().upper()
    company = payload.company.strip()
    
    if not plate:
        raise HTTPException(status_code=400, detail="车牌号不能为空！")
        
    pending_list = load_pending_vehicles()
    found = False
    for item in pending_list:
        if item["plate"].upper() == original_plate:
            item["plate"] = plate
            item["company"] = company
            found = True
            break
            
    if not found:
        for item in pending_list:
            if item["plate"].upper() == plate:
                item["company"] = company
                found = True
                break
                
    if not found:
        raise HTTPException(status_code=404, detail="未找到对应的待备案记录")
        
    save_pending_vehicles(pending_list)
    return {"success": True}

@app.post("/api/admin/unfile-vehicle")
async def unfile_vehicle(payload: UnfileVehiclePayload):
    plate = payload.plate.strip().upper()
    company = payload.company.strip()
    
    if not plate:
        raise HTTPException(status_code=400, detail="车牌号不能为空！")
        
    if os.path.exists(DATA_FILE):
        try:
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"读取本地备案库失败: {e}")
            
        vehicles = data.get("vehicles", [])
        updated_vehicles = [v for v in vehicles if v.upper() != plate]
        data["vehicles"] = updated_vehicles
        data["total_vehicles"] = len(updated_vehicles)
        
        transports = data.get("transports", [])
        for t in transports:
            if t.get("companyname") == company:
                carnumbers = t.get("carnumbers", "")
                if carnumbers:
                    car_list = [c.strip().upper() for c in carnumbers.split(",") if c.strip().upper() != plate]
                    t["carnumbers"] = ",".join(car_list)
                    t["carcount"] = str(len(car_list))
                    
        temp_transports = data.get("temporary_transports", [])
        for t in temp_transports:
            if t.get("companyName") == company:
                carnumbers = t.get("carnumbers", "")
                if carnumbers:
                    car_list = [c.strip().upper() for c in carnumbers.split(",") if c.strip().upper() != plate]
                    t["carnumbers"] = ",".join(car_list)
                    t["carcount"] = len(car_list)
                    
        try:
            with open(DATA_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"保存备案库失败: {e}")
            
    pending_list = load_pending_vehicles()
    for item in pending_list:
        if item["plate"].upper() == plate:
            item["status"] = "pending"
            
    save_pending_vehicles(pending_list)
    return {"success": True}





# Web 一站式全栈托管部署支持
import os
from fastapi.staticfiles import StaticFiles

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONTEND_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "frontend"))

if os.path.exists(FRONTEND_DIR):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
