# 车准 · 车辆与消纳准入查询
**Vehicle Access Desk** · 车牌核验、运单查询与处置场所数据查看。

面向工程运输场景，用一个网页入口查询车辆和关联运单，并查看消纳场所额度及统计。原项目名仅强调“车牌查询”，已不能覆盖现有查询与同步能力。

[线上查询](https://web.etgq.com/)

## 功能范围

- 车辆信息查询与本地缓存查询。
- 来源平台登录辅助与凭据配置。
- 运单查询、数据同步和场所额度维护。
- 场所月度统计与矩阵缓存。

结果依赖来源平台权限、数据更新时间及接口状态，不构成独立的行政准入证明。同步配置、管理写入和公开查询应区分访问权限。

## 项目结构

```text
backend/app/      FastAPI 接口和同步逻辑
backend/tests/    登录辅助和数据处理测试
frontend/         HTML、JavaScript、CSS 查询界面
start.bat         Windows 启动辅助
setup_schedule.ps1  历史调度辅助
```

## 本地运行

需要 Python 3.11+。在隔离开发目录配置来源凭据，不要复制线上令牌。

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

访问 `http://127.0.0.1:8001/`。Windows 用户可先审阅 `start.bat` 再运行。测试在 backend 目录执行：

```sh
python -m pytest tests
```

## 部署与安全

线上入口为 `web.etgq.com`，后端监听 8001。Nginx 的查询、同步和静态资源路由应一起核对，不要与 `ylt.etgq.com` 的运输账目接口混用。

`backend/config.json`、来源凭据、运行缓存和同步结果属于部署状态。更新代码前备份，发布时不得用仓库里的历史缓存覆盖最新线上数据。既有 JSON 文件不是当前线上数据完整性的承诺。

不要公开配置接口中的令牌，也不要将真实密码、数据库或日志提交到 Git。登录、验证码与来源授权流程仍由用户本人完成；禁止绕过来源平台限制。代码归档和改名不会更改线上域名或数据。
