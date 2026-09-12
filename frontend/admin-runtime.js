const BACKEND_URL = window.location.origin;
const CONFIG_KEY = "PLATE_QUERY_CONFIG";
const THEME_KEY = "PLATE_QUERY_THEME";
const DEFAULT_TOKEN = "";

let appConfig = {
    authtoken: DEFAULT_TOKEN,
    id: "225642",
    worksitetype: "1"
};
let captchaUuid = "";

let fetchedVehicles = [];
let fetchedTransports = [];
let fetchedTempTransports = [];
let fetchedWorksiteName = "未命名工地";
let dom = {};

// QR Helper variables
let qrVehiclesList = [];
let qrTemplates = {
    worksite: "http://ztxn.capcloud.com.cn:8080/dist/index.html#/scan/worksite?plate={plate}",
    dump: "http://ztxn.capcloud.com.cn:8080/dist/index.html#/scan/dump?plate={plate}"
};
const QR_STORAGE_KEY = "PLATE_QUERY_QR_HELPER_DATA";
let activeQrVehiclePlate = null;
let activeQrType = null;
let activeCustomConfirmResolve = null;
let activeCustomConfirmCleanUp = null;

function $(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    if (!value) return "";
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function setDisplay(element, style) {
    if (element) element.style.display = style;
}

function safeAddListener(element, event, callback) {
    if (element) {
        element.addEventListener(event, callback);
    }
}

function isNewEnergyVehicle(plate) {
    if (!plate) return false;
    const cleanPlate = plate.trim().toUpperCase();
    return cleanPlate.length === 8;
}

// Dom Initializer
function initDom() {
    dom = {
        // Theme & Tabs & Auth
        themeToggleBtn: $("themeToggleBtn"),
        adminLogoutBtn: $("adminLogoutBtn"),
        tabOcrBtn: $("tabOcrBtn"),
        tabWaybillBtn: $("tabWaybillBtn"),
        tabAbsorptiveBtn: $("tabAbsorptiveBtn"),
        tabQrBtn: $("tabQrBtn"),
        tabConfigBtn: $("tabConfigBtn"),
        ocrPage: $("ocrPage"),
        waybillPage: $("waybillPage"),
        absorptivePage: $("absorptivePage"),
        qrPage: $("qrPage"),
        configPage: $("configPage"),

        // Absorptive capacity analysis
        absorptiveSelectName: $("absorptiveSelectName"),
        absorptiveSelectYear: $("absorptiveSelectYear"),
        absorptiveStartMonth: $("absorptiveStartMonth"),
        absorptiveEndMonth: $("absorptiveEndMonth"),
        absorptiveQuotaInput: $("absorptiveQuotaInput"),
        saveQuotaBtn: $("saveQuotaBtn"),
        queryAbsorptiveStatsBtn: $("queryAbsorptiveStatsBtn"),
        kpiTotalQuota: $("kpiTotalQuota"),
        kpiUsedTotal: $("kpiUsedTotal"),
        kpiRemainingCapacity: $("kpiRemainingCapacity"),
        kpiUsagePercentage: $("kpiUsagePercentage"),
        kpiTotalTrips: $("kpiTotalTrips"),
        capacityStatusBadge: $("capacityStatusBadge"),
        capacityProgressBar: $("capacityProgressBar"),
        progressUsedText: $("progressUsedText"),
        progressQuotaText: $("progressQuotaText"),
        monthlyChartContainer: $("monthlyChartContainer"),
        absorptiveMonthlyTableBody: $("absorptiveMonthlyTableBody"),

        // Matrix table and mobile elements
        queryMatrixStatsBtn: $("queryMatrixStatsBtn"),
        absorptiveMatrixTableBody: $("absorptiveMatrixTableBody"),
        matrixHandledCapacity: $("matrixHandledCapacity"),
        matrixProjectVolume: $("matrixProjectVolume"),
        matrixUnhandledVolume: $("matrixUnhandledVolume"),
        absorptiveSnapshotBanner: $("absorptiveSnapshotBanner"),
        absorptiveCacheTimeText: $("absorptiveCacheTimeText"),
        absorptiveCacheStatusPill: $("absorptiveCacheStatusPill"),
        viewModeTableBtn: $("viewModeTableBtn"),
        viewModeCardBtn: $("viewModeCardBtn"),
        absorptiveMobileCardsContainer: $("absorptiveMobileCardsContainer"),
        absorptiveTableContainer: $("absorptiveTableContainer"),

        // Volcengine Config
        volcAkInput: $("volcAkInput"),
        volcSkInput: $("volcSkInput"),
        saveVolcConfigBtn: $("saveVolcConfigBtn"),

        // Drag & Drop Upload
        uploadZone: $("uploadZone"),
        fileInput: $("fileInput"),
        progressBarContainer: $("progressBarContainer"),
        progressBarFill: $("progressBarFill"),
        ocrResultsPanel: $("ocrResultsPanel"),
        ocrResultsList: $("ocrResultsList"),

        // Pending filings list
        pendingTableBody: $("pendingTableBody"),
        refreshPendingBtn: $("refreshPendingBtn"),

        // Waybills query
        toggleAdvancedFiltersBtn: $("toggleAdvancedFiltersBtn"),
        advancedFiltersPanel: $("advancedFiltersPanel"),
        waybillFilterState: $("waybillFilterState"),
        waybillFilterWorksiteId: $("waybillFilterWorksiteId"),
        waybillFilterCode: $("waybillFilterCode"),
        waybillFilterStarTime: $("waybillFilterStarTime"),
        waybillFilterEndTime: $("waybillFilterEndTime"),
        waybillFilterLimit: $("waybillFilterLimit"),
        waybillQueryBtn: $("waybillQueryBtn"),
        waybillResetBtn: $("waybillResetBtn"),
        waybillsTablePanelSection: $("waybillsTablePanelSection"),
        waybillStatsDisplay: $("waybillStatsDisplay"),
        waybillSummaryStats: $("waybillSummaryStats"),
        waybillTotalTonnage: $("waybillTotalTonnage"),
        waybillsTableBody: $("waybillsTableBody"),

        // QR code helper
        batchAddBtn: $("batchAddBtn"),
        resetAllVehiclesBtn: $("resetAllVehiclesBtn"),
        qrVehiclesGrid: $("qrVehiclesGrid"),

        // QR Code Modal
        qrCodeModal: $("qrCodeModal"),
        closeQrCodeModalBtn: $("closeQrCodeModalBtn"),
        cancelQrCodeModalBtn: $("cancelQrCodeModalBtn"),
        confirmQrScannedBtn: $("confirmQrScannedBtn"),
        qrCodeModalTitle: $("qrCodeModalTitle"),
        qrCodeStepBadge: $("qrCodeStepBadge"),
        qrCodeStepTitle: $("qrCodeStepTitle"),
        qrCodeImage: $("qrCodeImage"),
        qrCodeImageFallback: $("qrCodeImageFallback"),
        qrCodePlateDisplay: $("qrCodePlateDisplay"),

        // Custom Confirm Modal
        customConfirmModal: $("customConfirmModal"),
        closeCustomConfirmModalBtn: $("closeCustomConfirmModalBtn"),
        cancelCustomConfirmBtn: $("cancelCustomConfirmBtn"),
        confirmCustomConfirmBtn: $("confirmCustomConfirmBtn"),
        customConfirmTitle: $("customConfirmTitle"),
        customConfirmMessage: $("customConfirmMessage"),

        // Batch Add Modal
        batchAddModal: $("batchAddModal"),
        closeBatchAddModalBtn: $("closeBatchAddModalBtn"),
        cancelBatchAddModalBtn: $("cancelBatchAddModalBtn"),
        confirmBatchAddBtn: $("confirmBatchAddBtn"),
        batchAddTextArea: $("batchAddTextArea"),

        // Edit Modal
        editQrModal: $("editQrModal"),
        closeEditQrModalBtn: $("closeEditQrModalBtn"),
        cancelEditQrModalBtn: $("cancelEditQrModalBtn"),
        saveEditQrBtn: $("saveEditQrBtn"),
        editQrPlateDisplay: $("editQrPlateDisplay"),
        vehicleUploadStatus: $("vehicleUploadStatus"),
        vehicleQrPreviewBox: $("vehicleQrPreviewBox"),
        vehicleQrFileInput: $("vehicleQrFileInput"),
        deleteVehicleQrBtn: $("deleteVehicleQrBtn"),
        deleteVehicleBtn: $("deleteVehicleBtn"),

        // System Configuration
        tokenInput: $("tokenInput"),
        worksiteIdInput: $("worksiteIdInput"),
        worksiteTypeInput: $("worksiteTypeInput"),
        saveConfigBtn: $("saveConfigBtn"),
        loginUsernameInput: $("loginUsernameInput"),
        loginPasswordInput: $("loginPasswordInput"),
        captchaImage: $("captchaImage"),
        refreshCaptchaBtn: $("refreshCaptchaBtn"),
        captchaCodeInput: $("captchaCodeInput"),
        autoLoginBtn: $("autoLoginBtn"),
        loginStatus: $("loginStatus"),
        syncConfigFromServerBtn: $("syncConfigFromServerBtn"),
        
        // Public API config
        publicApiEnabledCheckbox: $("publicApiEnabledCheckbox"),
        publicApiKeyInput: $("publicApiKeyInput"),
        publicApiUrlDisplay: $("publicApiUrlDisplay"),
        copyPublicApiUrlBtn: $("copyPublicApiUrlBtn"),
        generateApiKeyBtn: $("generateApiKeyBtn"),
        savePublicApiConfigBtn: $("savePublicApiConfigBtn"),

        // Volcengine Config
        volcAkInput: $("volcAkInput"),
        volcSkInput: $("volcSkInput"),
        saveVolcConfigBtn: $("saveVolcConfigBtn")
    };
}

function loadConfig() {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            appConfig = {
                authtoken: parsed.authtoken || DEFAULT_TOKEN,
                id: parsed.id || "225642",
                worksitetype: parsed.worksitetype || "1"
            };
        } catch {
            localStorage.removeItem(CONFIG_KEY);
        }
    }
}

// Configuration sync
async function loadConfigFromServer(force = false) {
    try {
        const response = await fetch(`${BACKEND_URL}/api/config`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.success) {
            if (data.authtoken) {
                appConfig.authtoken = data.authtoken;
            }
            appConfig.id = data.id || appConfig.id || "225642";
            appConfig.worksitetype = data.worksitetype || appConfig.worksitetype || "1";
            localStorage.setItem(CONFIG_KEY, JSON.stringify(appConfig));
            
            if (dom.tokenInput) dom.tokenInput.value = appConfig.authtoken || "";
            if (dom.worksiteIdInput) dom.worksiteIdInput.value = appConfig.id;
            if (dom.worksiteTypeInput) dom.worksiteTypeInput.value = appConfig.worksitetype;
            
            console.log("Successfully loaded configs from server.");
            if (force) {
                alert("🎉 已成功从服务端拉取公共配置！");
            }
        }
    } catch (err) {
        console.error("Failed to load backend config:", err);
        if (force) {
            alert(`拉取配置失败: ${err.message}`);
        }
    }
}

// Initialize theme
function initTheme() {
    let savedTheme = localStorage.getItem(THEME_KEY);
    if (!savedTheme) {
        const hour = new Date().getHours();
        savedTheme = (hour >= 6 && hour < 18) ? "light" : "dark";
    }
    applyTheme(savedTheme);
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem(THEME_KEY, theme);
    const icon = theme === "light" ? '<i class="fa-solid fa-sun"></i> 浅色模式' : '<i class="fa-solid fa-moon"></i> 暗色模式';
    if (dom.themeToggleBtn) {
        dom.themeToggleBtn.innerHTML = icon;
    }
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute("data-theme");
    const newTheme = (currentTheme === "light") ? "dark" : "light";
    applyTheme(newTheme);
}

// Tab Switcher
function switchTab(activeTab) {
    const tabs = [dom.tabOcrBtn, dom.tabWaybillBtn, dom.tabAbsorptiveBtn, dom.tabQrBtn, dom.tabConfigBtn];
    const pages = [dom.ocrPage, dom.waybillPage, dom.absorptivePage, dom.qrPage, dom.configPage];
    
    tabs.forEach(t => { if (t) t.classList.remove("active"); });
    pages.forEach(p => { if (p) setDisplay(p, "none"); });

    if (activeTab === "ocr") {
        if (dom.tabOcrBtn) dom.tabOcrBtn.classList.add("active");
        setDisplay(dom.ocrPage, "block");
    } else if (activeTab === "waybill") {
        if (dom.tabWaybillBtn) dom.tabWaybillBtn.classList.add("active");
        setDisplay(dom.waybillPage, "block");
        if (dom.waybillsTableBody && dom.waybillsTableBody.querySelector(".table-empty")) {
            queryWaybills();
        }
    } else if (activeTab === "absorptive") {
        if (dom.tabAbsorptiveBtn) dom.tabAbsorptiveBtn.classList.add("active");
        setDisplay(dom.absorptivePage, "block");
        loadLocalMatrixData();
    } else if (activeTab === "qr") {
        if (dom.tabQrBtn) dom.tabQrBtn.classList.add("active");
        setDisplay(dom.qrPage, "block");
    } else if (activeTab === "config") {
        if (dom.tabConfigBtn) dom.tabConfigBtn.classList.add("active");
        setDisplay(dom.configPage, "block");
        loadCaptcha();
    }
}

// Volcano configs load/save
async function loadVolcConfig() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/config`, { cache: "no-store" });
        const data = await response.json();
        if (data.success) {
            if (dom.volcAkInput) dom.volcAkInput.value = data.volc_ak || "";
            if (dom.volcSkInput) dom.volcSkInput.value = data.volc_sk || "";
        }
    } catch (err) {
        console.error("加载密钥配置失败:", err);
    }
}

// Public API configuration load/save
async function loadPublicApiConfig() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/public-api-config`, { cache: "no-store" });
        const data = await response.json();
        if (data.success) {
            if (dom.publicApiEnabledCheckbox) {
                dom.publicApiEnabledCheckbox.checked = data.public_api_enabled;
            }
            if (dom.publicApiKeyInput) {
                dom.publicApiKeyInput.value = data.public_api_key || "";
            }
            updatePublicApiUrlDisplay();
        }
    } catch (err) {
        console.error("加载外部 API 配置失败:", err);
    }
}

function updatePublicApiUrlDisplay() {
    if (!dom.publicApiUrlDisplay) return;
    const enabled = dom.publicApiEnabledCheckbox ? dom.publicApiEnabledCheckbox.checked : true;
    if (!enabled) {
        dom.publicApiUrlDisplay.textContent = "接口已被禁用";
        if (dom.copyPublicApiUrlBtn) dom.copyPublicApiUrlBtn.disabled = true;
        return;
    }
    if (dom.copyPublicApiUrlBtn) dom.copyPublicApiUrlBtn.disabled = false;
    const key = dom.publicApiKeyInput ? dom.publicApiKeyInput.value.trim() : "";
    let url = `${window.location.origin}/api/public/vehicle-query?plate_no=京AFE851`;
    if (key) {
        url += `&apikey=${encodeURIComponent(key)}`;
    }
    dom.publicApiUrlDisplay.textContent = url;
}

async function savePublicApiConfig() {
    const enabled = dom.publicApiEnabledCheckbox ? dom.publicApiEnabledCheckbox.checked : true;
    const key = dom.publicApiKeyInput ? dom.publicApiKeyInput.value.trim() : "";

    try {
        if (dom.savePublicApiConfigBtn) dom.savePublicApiConfigBtn.disabled = true;
        const response = await fetch(`${BACKEND_URL}/api/admin/public-api-config`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ public_api_enabled: enabled, public_api_key: key })
        });
        const data = await response.json();
        if (data.success) {
            alert("🎉 外部公开查询接口配置保存成功！");
            updatePublicApiUrlDisplay();
        } else {
            alert("保存失败: " + (data.detail || "未知错误"));
        }
    } catch (err) {
        alert("请求出错: " + err.message);
    } finally {
        if (dom.savePublicApiConfigBtn) dom.savePublicApiConfigBtn.disabled = false;
    }
}

function generateApiKey() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let key = "";
    for (let i = 0; i < 16; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (dom.publicApiKeyInput) {
        dom.publicApiKeyInput.value = key;
        updatePublicApiUrlDisplay();
    }
}

function copyPublicApiUrl() {
    const url = dom.publicApiUrlDisplay ? dom.publicApiUrlDisplay.textContent : "";
    if (!url || url === "接口已被禁用") return;
    
    navigator.clipboard.writeText(url).then(() => {
        alert("📋 外部 API 调用链接已成功复制到剪贴板！");
    }).catch(err => {
        alert("复制失败: " + err.message);
    });
}


async function saveVolcConfig() {
    const ak = dom.volcAkInput.value.trim();
    const sk = dom.volcSkInput.value.trim();
    
    if (!ak || !sk) {
        alert("Access Key 和 Secret Key 不能为空！");
        return;
    }

    try {
        dom.saveVolcConfigBtn.disabled = true;
        const response = await fetch(`${BACKEND_URL}/api/admin/config`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ volc_ak: ak, volc_sk: sk })
        });
        const data = await response.json();
        if (data.success) {
            alert("火山引擎密钥配置保存成功！");
        } else {
            alert("保存失败: " + (data.detail || "未知错误"));
        }
    } catch (err) {
        alert("请求出错: " + err.message);
    } finally {
        dom.saveVolcConfigBtn.disabled = false;
    }
}

// Pending List management
async function loadPendingList() {
    try {
        dom.pendingTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 30px;">
                    <i class="fa-solid fa-circle-notch fa-spin"></i> 正在加载待备案列表...
                </td>
            </tr>
        `;
        const response = await fetch(`${BACKEND_URL}/api/admin/pending`, { cache: "no-store" });
        const data = await response.json();
        
        if (!data.success || !data.pending_vehicles || data.pending_vehicles.length === 0) {
            dom.pendingTableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 30px;">
                        <i class="fa-solid fa-check-double" style="color: var(--neon-green-solid); margin-right: 8px;"></i> 暂无待审核的备案车辆，所有车辆均已备案！
                    </td>
                </tr>
            `;
            return;
        }

        let html = "";
        const sortedVehicles = [...data.pending_vehicles].sort((a, b) => {
            const companyA = a.company || "";
            const companyB = b.company || "";
            return companyA.localeCompare(companyB, "zh-CN");
        });
        sortedVehicles.forEach((item, index) => {
            const statusBadge = item.status === "filed" 
                ? `<span class="badge badge-success">已备案</span>` 
                : `<span class="badge badge-warning">待备案</span>`;
            
            const actionsHtml = item.status === "filed" 
                ? `
                    <button class="btn btn-secondary btn-mini" style="background: rgba(197, 138, 31, 0.1); border-color: rgba(197, 138, 31, 0.2); color: var(--neon-orange);" onclick="handleUnfileVehicle(${index})">
                        <i class="fa-solid fa-rotate-left"></i> 撤回
                    </button>
                ` 
                : `
                    <button class="btn btn-success btn-mini" onclick="handleFileVehicle(${index})">
                        <i class="fa-solid fa-check"></i> 确认备案
                    </button>
                    <button class="btn btn-secondary btn-mini" style="background: rgba(180,35,24,0.1); border-color: rgba(180,35,24,0.2); color: #f87171;" onclick="handleDeletePending('${escapeHtml(item.plate)}')">
                        <i class="fa-solid fa-trash-can"></i> 忽略
                    </button>
                `;

            html += `
                <tr id="row-${index}">
                    <td style="text-align: center; font-weight: 700;">
                        <input type="text" class="editable-input" style="text-align: center; font-family: var(--font-outfit); font-weight: 800;" value="${escapeHtml(item.plate)}" id="plate-${index}" data-original="${escapeHtml(item.plate)}" data-original-company="${escapeHtml(item.company)}" onblur="handleUpdatePending(${index})" ${item.status === 'filed' ? 'disabled' : ''}>
                    </td>
                    <td>
                        <input type="text" class="editable-input" value="${escapeHtml(item.company)}" id="company-${index}" onblur="handleUpdatePending(${index})" ${item.status === 'filed' ? 'disabled' : ''}>
                    </td>
                    <td style="color: var(--text-secondary); font-size: 12px;">${escapeHtml(item.source || "-")}</td>
                    <td style="text-align: center; font-size: 12px; color: var(--text-secondary);">${escapeHtml(item.added_time || "-")}</td>
                    <td style="text-align: center;" id="status-${index}">${statusBadge}</td>
                    <td style="text-align: center;">
                        <div class="actions-cell" id="actions-${index}">${actionsHtml}</div>
                    </td>
                </tr>
            `;
        });
        dom.pendingTableBody.innerHTML = html;
    } catch (err) {
        dom.pendingTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; color: var(--neon-red); padding: 30px;">
                    <i class="fa-solid fa-triangle-exclamation"></i> 加载失败: ${err.message}
                </td>
            </tr>
        `;
    }
}

// Bind to window for HTML inline invocation
window.handleFileVehicle = async function(index) {
    const plateInput = $(`plate-${index}`);
    const companyInput = $(`company-${index}`);
    
    const plate = plateInput.value.trim().toUpperCase();
    const company = companyInput.value.trim();
    const originalPlate = plateInput.dataset.original || plate;
    
    if (!plate) {
        alert("车牌号不能为空！");
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/file-vehicle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plate, company, original_plate: originalPlate })
        });
        const data = await response.json();
        if (data.success) {
            plateInput.disabled = true;
            companyInput.disabled = true;
            
            const statusCell = $(`status-${index}`);
            const actionsCell = $(`actions-${index}`);
            if (statusCell) {
                statusCell.innerHTML = `<span class="badge badge-success">已备案</span>`;
            }
            if (actionsCell) {
                actionsCell.innerHTML = `
                    <button class="btn btn-secondary btn-mini" style="background: rgba(197, 138, 31, 0.1); border-color: rgba(197, 138, 31, 0.2); color: var(--neon-orange);" onclick="handleUnfileVehicle(${index})">
                        <i class="fa-solid fa-rotate-left"></i> 撤回
                    </button>
                `;
            }
            
            // Sync list to update autocomplete cache
            fetchLocalData();
        } else {
            alert("备案失败: " + (data.detail || "未知错误"));
        }
    } catch (err) {
        alert("请求出错: " + err.message);
    }
};

window.handleUnfileVehicle = async function(index) {
    const plateInput = $(`plate-${index}`);
    const companyInput = $(`company-${index}`);
    
    if (!plateInput || !companyInput) return;
    
    const plate = plateInput.value.trim().toUpperCase();
    const company = companyInput.value.trim();
    
    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/unfile-vehicle`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plate, company })
        });
        const data = await response.json();
        if (data.success) {
            plateInput.disabled = false;
            companyInput.disabled = false;
            
            const statusCell = $(`status-${index}`);
            const actionsCell = $(`actions-${index}`);
            if (statusCell) {
                statusCell.innerHTML = `<span class="badge badge-warning">待备案</span>`;
            }
            if (actionsCell) {
                actionsCell.innerHTML = `
                    <button class="btn btn-success btn-mini" onclick="handleFileVehicle(${index})">
                        <i class="fa-solid fa-check"></i> 确认备案
                    </button>
                    <button class="btn btn-secondary btn-mini" style="background: rgba(180,35,24,0.1); border-color: rgba(180,35,24,0.2); color: #f87171;" onclick="handleDeletePending('${escapeHtml(plate)}')">
                        <i class="fa-solid fa-trash-can"></i> 忽略
                    </button>
                `;
            }
            fetchLocalData();
        } else {
            alert("撤回失败: " + (data.detail || "未知错误"));
        }
    } catch (err) {
        alert("请求出错: " + err.message);
    }
};

window.handleUpdatePending = async function(index) {
    const plateInput = $(`plate-${index}`);
    const companyInput = $(`company-${index}`);
    
    if (!plateInput || !companyInput) return;
    
    const plate = plateInput.value.trim().toUpperCase();
    const company = companyInput.value.trim();
    const originalPlate = plateInput.dataset.original || plate;
    const originalCompany = plateInput.dataset.originalCompany || "";
    
    // If nothing changed, do nothing
    if (plate === originalPlate && company === originalCompany) {
        return;
    }
    
    if (!plate) {
        alert("车牌号不能为空！");
        plateInput.value = originalPlate;
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/update-pending`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ original_plate: originalPlate, plate, company })
        });
        const data = await response.json();
        if (data.success) {
            plateInput.dataset.original = plate;
            plateInput.dataset.originalCompany = company;
            
            const greenBorder = "1px solid var(--neon-green-solid, #1f8f6a)";
            const origPlateBorder = plateInput.style.border;
            const origCompanyBorder = companyInput.style.border;
            
            plateInput.style.border = greenBorder;
            companyInput.style.border = greenBorder;
            
            setTimeout(() => {
                plateInput.style.border = origPlateBorder;
                companyInput.style.border = origCompanyBorder;
            }, 1000);
            
            console.log(`Successfully updated pending vehicle to ${plate}`);
        } else {
            console.error("更新待备案记录失败: " + (data.detail || "未知错误"));
        }
    } catch (err) {
        console.error("更新待备案请求出错: " + err.message);
    }
};

window.handleDeletePending = async function(plate) {
    if (!confirm(`确定要忽略或移除车牌 ${plate} 的临时识别记录吗？`)) {
        return;
    }
    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/delete-pending`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plate })
        });
        const data = await response.json();
        if (data.success) {
            loadPendingList();
        } else {
            alert("操作失败: " + (data.detail || "未知错误"));
        }
    } catch (err) {
        alert("请求出错: " + err.message);
    }
};

// Sync local database to allow autocomplete match on newly added vehicles
async function fetchLocalData() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/local-data`, { cache: "no-store" });
        const data = await response.json();
        if (data.success && data.has_data) {
            fetchedVehicles = data.vehicles || [];
            fetchedTransports = data.transports || [];
            fetchedTempTransports = data.temporary_transports || [];
            fetchedWorksiteName = data.worksite_name || "未命名工地";
        }
    } catch (err) {
        console.error("加载本地备案数据失败:", err);
    }
}

// Upload zone config
function setupUploadEvents() {
    const zone = dom.uploadZone;
    if (!zone) return;
    
    zone.addEventListener("click", () => dom.fileInput.click());
    
    dom.fileInput.addEventListener("change", event => {
        const files = event.target.files;
        if (files.length > 0) {
            uploadAndOcr(files);
        }
    });

    zone.addEventListener("dragover", e => {
        e.preventDefault();
        zone.classList.add("dragover");
    });

    zone.addEventListener("dragleave", () => {
        zone.classList.remove("dragover");
    });

    zone.addEventListener("drop", e => {
        e.preventDefault();
        zone.classList.remove("dragover");
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadAndOcr(files);
        }
    });
}

async function uploadAndOcr(files) {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
        formData.append("files", files[i]);
    }

    dom.progressBarContainer.style.display = "block";
    dom.progressBarFill.style.width = "20%";
    dom.ocrResultsPanel.style.display = "none";
    dom.ocrResultsList.innerHTML = "";

    try {
        const response = await fetch(`${BACKEND_URL}/api/admin/ocr-waybill`, {
            method: "POST",
            body: formData
        });
        dom.progressBarFill.style.width = "70%";
        
        const data = await response.json();
        dom.progressBarFill.style.width = "100%";
        
        if (!response.ok) {
            throw new Error(data.detail || "识别请求失败");
        }

        let html = "";
        data.results.forEach(res => {
            let statusLabel = "";
            if (!res.success) {
                statusLabel = `<span class="badge badge-danger">失败: ${res.msg}</span>`;
            } else if (res.status === "filed") {
                statusLabel = `<span class="badge badge-success">已备案: ${res.plate}</span>`;
            } else {
                statusLabel = `<span class="badge badge-warning">新识别: ${res.plate} (已加待备案)</span>`;
            }

            html += `
                <div class="ocr-result-item">
                    <span style="font-weight: 500; font-family: var(--font-outfit); max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(res.filename)}</span>
                    <span>${statusLabel}</span>
                </div>
            `;
        });

        dom.ocrResultsList.innerHTML = html;
        dom.ocrResultsPanel.style.display = "block";
        loadPendingList();
    } catch (err) {
        alert("识别失败: " + err.message);
    } finally {
        setTimeout(() => {
            dom.progressBarContainer.style.display = "none";
            dom.progressBarFill.style.width = "0%";
        }, 1000);
    }
}

// --- Absorptive Site Capacity Analytics Implementation ---
async function saveAbsorptiveQuota() {
    const name = dom.absorptiveSelectName ? dom.absorptiveSelectName.value.trim() : "";
    const quotaVal = dom.absorptiveQuotaInput ? parseFloat(dom.absorptiveQuotaInput.value) : 0;
    
    if (!name) {
        alert("请输入要配置的土点名称");
        return;
    }
    if (isNaN(quotaVal) || quotaVal < 0) {
        alert("请输入有效的配额数值");
        return;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/absorptive/quotas`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, quota: quotaVal })
        });
        const data = await response.json();
        if (data.success) {
            alert(`🎉 土点【${name}】的核准容量配额已成功更新为 ${quotaVal.toLocaleString()} m³！`);
            queryAbsorptiveStats();
        } else {
            alert(`保存失败: ${data.detail || "服务端异常"}`);
        }
    } catch (err) {
        alert(`保存土点配置请求失败: ${err.message}`);
    }
}

async function queryAbsorptiveStats() {
    if (!appConfig.authtoken) {
        alert("未发现服务授权密钥，请先在【接口配置】中保存或同步 authtoken！");
        return;
    }

    const absorptivename = dom.absorptiveSelectName ? dom.absorptiveSelectName.value.trim() : "首钢";
    const year = dom.absorptiveSelectYear ? parseInt(dom.absorptiveSelectYear.value) : 2026;
    const startMonth = dom.absorptiveStartMonth ? parseInt(dom.absorptiveStartMonth.value) : 1;
    const endMonth = dom.absorptiveEndMonth ? parseInt(dom.absorptiveEndMonth.value) : 12;

    if (dom.queryAbsorptiveStatsBtn) {
        dom.queryAbsorptiveStatsBtn.disabled = true;
        dom.queryAbsorptiveStatsBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> 跨月并发聚合中...`;
    }

    if (dom.absorptiveMonthlyTableBody) {
        dom.absorptiveMonthlyTableBody.innerHTML = `
            <tr>
                <td colspan="5" class="table-empty">
                    <i class="fa-solid fa-circle-notch fa-spin empty-icon" style="font-size: 24px;"></i>
                    <p>正在跨月份请求官方运单中枢数据，请稍候...</p>
                </td>
            </tr>
        `;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/absorptive/monthly-stats`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                authtoken: appConfig.authtoken,
                absorptivename,
                year,
                startMonth,
                endMonth
            })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error((data.detail && typeof data.detail === 'string') ? data.detail : "土点数据处理失败");
        }

        // 1. Update KPI Cards
        const totalQuota = data.total_quota || 50000;
        const usedTotal = data.used_total || 0;
        const remainingCapacity = data.remaining_capacity || 0;
        const usagePercentage = data.usage_percentage || 0;
        const totalTrips = data.total_trips || 0;

        if (dom.kpiTotalQuota) dom.kpiTotalQuota.innerHTML = `${totalQuota.toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span class="unit">m³</span>`;
        if (dom.kpiUsedTotal) dom.kpiUsedTotal.innerHTML = `${usedTotal.toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span class="unit">m³</span>`;
        if (dom.kpiRemainingCapacity) dom.kpiRemainingCapacity.innerHTML = `${remainingCapacity.toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2})} <span class="unit">m³</span>`;
        if (dom.kpiUsagePercentage) dom.kpiUsagePercentage.textContent = `使用率: ${usagePercentage}%`;
        if (dom.kpiTotalTrips) dom.kpiTotalTrips.textContent = `共 ${totalTrips} 车次`;
        if (dom.absorptiveQuotaInput) dom.absorptiveQuotaInput.value = totalQuota;

        // 2. Update Progress Bar & Status Badge
        const progressWidth = Math.min(100, Math.max(0, usagePercentage));
        if (dom.capacityProgressBar) {
            dom.capacityProgressBar.style.width = `${progressWidth}%`;
            if (usagePercentage >= 90) {
                dom.capacityProgressBar.style.background = "linear-gradient(90deg, #f87171, #ef4444)";
            } else if (usagePercentage >= 75) {
                dom.capacityProgressBar.style.background = "linear-gradient(90deg, #fbbf24, #f59e0b)";
            } else {
                dom.capacityProgressBar.style.background = "linear-gradient(90deg, #4ade80, #38bdf8)";
            }
        }
        if (dom.progressUsedText) dom.progressUsedText.textContent = `${usedTotal.toLocaleString()} m³ (${usagePercentage}%)`;
        if (dom.progressQuotaText) dom.progressQuotaText.textContent = `${totalQuota.toLocaleString()} m³`;
        if (dom.capacityStatusBadge) {
            if (usagePercentage >= 90) {
                dom.capacityStatusBadge.className = "badge badge-danger";
                dom.capacityStatusBadge.textContent = "🚨 容量临界警报";
            } else if (usagePercentage >= 75) {
                dom.capacityStatusBadge.className = "badge badge-warning";
                dom.capacityStatusBadge.textContent = "⚠️ 容量预警";
            } else {
                dom.capacityStatusBadge.className = "badge badge-success";
                dom.capacityStatusBadge.textContent = "✅ 容量充足";
            }
        }

        // 3. Render Monthly Chart Bars
        const monthlyData = data.monthly_data || [];
        const maxMonthCount = Math.max(1, ...monthlyData.map(m => m.count));

        if (dom.monthlyChartContainer) {
            if (!monthlyData.length) {
                dom.monthlyChartContainer.innerHTML = `<div style="text-align: center; width: 100%; color: var(--text-secondary); font-size: 13px;">无月度统计数据</div>`;
            } else {
                dom.monthlyChartContainer.innerHTML = monthlyData.map(m => {
                    const heightPercent = maxMonthCount > 0 ? Math.max(8, Math.round((m.count / maxMonthCount) * 100)) : 8;
                    return `
                        <div style="flex: 1; min-width: 48px; max-width: 70px; display: flex; flex-direction: column; align-items: center; gap: 6px;">
                            <span style="font-size: 11px; font-weight: 700; color: var(--neon-cyan);">${m.count > 0 ? m.count : '-'}</span>
                            <div style="width: 100%; height: 140px; display: flex; align-items: flex-end; justify-content: center; background: rgba(255, 255, 255, 0.03); border-radius: 6px; padding: 4px;">
                                <div style="width: 100%; height: ${heightPercent}%; background: linear-gradient(180deg, #38bdf8 0%, #0284c7 100%); border-radius: 4px; transition: height 0.5s ease;" title="${m.month_name}: ${m.count} m³ (${m.trips} 车次)"></div>
                            </div>
                            <span style="font-size: 12px; font-weight: 600; color: var(--text-primary);">${m.month_name}</span>
                        </div>
                    `;
                }).join("");
            }
        }

        // 4. Render Monthly Table
        if (dom.absorptiveMonthlyTableBody) {
            if (!monthlyData.length) {
                dom.absorptiveMonthlyTableBody.innerHTML = `
                    <tr>
                        <td colspan="5" class="table-empty">
                            <i class="fa-solid fa-folder-open empty-icon"></i>
                            <p>选定时间范围内未检索到任何消纳记录</p>
                        </td>
                    </tr>
                `;
            } else {
                dom.absorptiveMonthlyTableBody.innerHTML = monthlyData.map(m => {
                    const monthShare = usedTotal > 0 ? ((m.count / usedTotal) * 100).toFixed(1) : "0.0";
                    return `
                        <tr>
                            <td style="text-align: center; font-weight: 700; color: var(--neon-cyan);">${escapeHtml(m.month_name)}</td>
                            <td><span style="font-size: 12px; color: var(--text-secondary);">${escapeHtml(m.starTime)} 至 ${escapeHtml(m.endTime)}</span></td>
                            <td style="text-align: right; font-weight: 800; font-family: var(--font-outfit); color: var(--text-primary);">${m.count.toLocaleString()}</td>
                            <td style="text-align: center; font-weight: 600; color: var(--neon-orange);">${m.trips}</td>
                            <td style="text-align: center;">
                                <span class="badge badge-success" style="font-family: var(--font-outfit);">${monthShare}%</span>
                            </td>
                        </tr>
                    `;
                }).join("");
            }
        }

    } catch (err) {
        if (dom.absorptiveMonthlyTableBody) {
            dom.absorptiveMonthlyTableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="table-empty text-red">
                        <i class="fa-solid fa-triangle-exclamation empty-icon" style="color: #f87171;"></i>
                        <p>跨月分析请求失败: ${escapeHtml(err.message)}</p>
                    </td>
                </tr>
            `;
        }
    } finally {
        if (dom.queryAbsorptiveStatsBtn) {
            dom.queryAbsorptiveStatsBtn.disabled = false;
            dom.queryAbsorptiveStatsBtn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> 一键执行跨月分析`;
        }
    }
}

let currentMatrixViewMode = "table"; // "table" or "card"
let cachedMatrixData = null;

function setAbsorptiveViewMode(mode) {
    currentMatrixViewMode = mode;
    if (dom.viewModeTableBtn) {
        if (mode === "table") dom.viewModeTableBtn.classList.add("active");
        else dom.viewModeTableBtn.classList.remove("active");
    }
    if (dom.viewModeCardBtn) {
        if (mode === "card") dom.viewModeCardBtn.classList.add("active");
        else dom.viewModeCardBtn.classList.remove("active");
    }
    if (dom.absorptiveTableContainer) {
        dom.absorptiveTableContainer.style.display = (mode === "table") ? "block" : "none";
    }
    if (dom.absorptiveMobileCardsContainer) {
        dom.absorptiveMobileCardsContainer.style.display = (mode === "card") ? "flex" : "none";
    }
}

function sortMatrixRowsByExpiration(rows) {
    if (!rows || !Array.isArray(rows)) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return [...rows].sort((a, b) => {
        const parseDate = (dStr) => {
            if (!dStr || dStr === "-" || typeof dStr !== "string") return null;
            const parts = dStr.replace(/-/g, "/").split("/");
            if (parts.length === 3) {
                const y = parseInt(parts[0]);
                const m = parseInt(parts[1]) - 1;
                const d = parseInt(parts[2]);
                if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
                    return new Date(y, m, d);
                }
            }
            return null;
        };

        const dateA = parseDate(a.expire_date);
        const dateB = parseDate(b.expire_date);

        const isExpiredA = dateA && dateA < today;
        const isExpiredB = dateB && dateB < today;

        // 1. 如果一个已过期，一个未过期：未过期的排在前面，已过期的排在最后面
        if (!isExpiredA && isExpiredB) return -1;
        if (isExpiredA && !isExpiredB) return 1;

        // 2. 两个都未过期：快到期的排在前面（按到期时间升序）
        if (!isExpiredA && !isExpiredB) {
            if (dateA && dateB) return dateA - dateB;
            if (dateA) return -1;
            if (dateB) return 1;
            return 0;
        }

        // 3. 两个都已过期：按到期日期先后排列在末尾
        if (dateA && dateB) return dateA - dateB;
        return 0;
    });
}

function getExpireStatusBadge(expireDateStr) {
    if (!expireDateStr || expireDateStr === "-") {
        return `<span class="badge" style="background: rgba(142, 170, 201, 0.1); color: var(--text-secondary); border: 1px solid rgba(142, 170, 201, 0.2);">长期 / 未设</span>`;
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const parts = String(expireDateStr).replace(/-/g, "/").split("/");
    if (parts.length === 3) {
        const expDate = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
        if (!isNaN(expDate.getTime())) {
            const diffDays = Math.ceil((expDate - today) / (1000 * 60 * 60 * 24));

            if (diffDays < 0) {
                return `<span class="badge" style="background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239,68,68,0.35); font-weight: 700; white-space: nowrap;"><i class="fa-solid fa-circle-xmark"></i> 已过期 (${escapeHtml(expireDateStr)})</span>`;
            } else if (diffDays <= 30) {
                return `<span class="badge" style="background: rgba(251, 191, 36, 0.15); color: #fbbf24; border: 1px solid rgba(251,191,36,0.4); font-weight: 700; white-space: nowrap;"><i class="fa-solid fa-triangle-exclamation"></i> 快到期 (剩${diffDays}天: ${escapeHtml(expireDateStr)})</span>`;
            } else {
                return `<span class="badge" style="background: rgba(0, 229, 255, 0.1); color: var(--neon-cyan); border: 1px solid rgba(0,229,255,0.25); white-space: nowrap;"><i class="fa-solid fa-circle-check"></i> 有效至: ${escapeHtml(expireDateStr)}</span>`;
            }
        }
    }
    return `<span class="badge" style="background: rgba(142, 170, 201, 0.1); color: var(--text-secondary); border: 1px solid rgba(142, 170, 201, 0.2);">${escapeHtml(expireDateStr)}</span>`;
}

function renderMatrixMobileCards(matrixRows, months) {
    if (!dom.absorptiveMobileCardsContainer) return;
    const sortedRows = sortMatrixRowsByExpiration(matrixRows);

    if (!sortedRows || !sortedRows.length) {
        dom.absorptiveMobileCardsContainer.innerHTML = `
            <div class="glass-panel" style="text-align: center; padding: 30px 20px; color: var(--text-secondary);">
                <i class="fa-solid fa-folder-open" style="font-size: 32px; margin-bottom: 8px; opacity: 0.5;"></i>
                <p>未找到符合条件的土点消纳数据</p>
            </div>
        `;
        return;
    }

    dom.absorptiveMobileCardsContainer.innerHTML = sortedRows.map((row, idx) => {
        const quota = row.total_quota || 0;
        const consumed = row.total_consumed || 0;
        const remaining = row.remaining !== undefined ? row.remaining : Math.max(0, quota - consumed);
        const usagePct = quota > 0 ? Math.min(100, Math.round((consumed / quota) * 100)) : 0;

        let progressColor = "linear-gradient(90deg, #4ade80, #38bdf8)";
        if (remaining < 10000) {
            progressColor = "linear-gradient(90deg, #f87171, #ef4444)";
        } else if (remaining < 30000) {
            progressColor = "linear-gradient(90deg, #fbbf24, #f59e0b)";
        }

        let monthChipsHtml = "";
        (months || []).forEach(m => {
            const val = row.monthly ? (row.monthly[m] || 0) : 0;
            monthChipsHtml += `
                <div class="site-month-chip">
                    <span class="site-month-label">${escapeHtml(m)}</span>
                    <span class="site-month-val">${val > 0 ? val.toLocaleString() : '0'}</span>
                </div>
            `;
        });

        return `
            <div class="site-mobile-card">
                <div class="site-card-header">
                    <div class="site-card-title">
                        <i class="fa-solid fa-mountain-city text-cyan"></i>
                        <span>${escapeHtml(row.name)}</span>
                    </div>
                    <div>${getExpireStatusBadge(row.expire_date)}</div>
                </div>

                <!-- 重点突出：当前剩余可用余量与核准额度 -->
                <div class="site-card-hero-metric" style="background: rgba(0, 229, 255, 0.04); border: 1px solid rgba(0, 229, 255, 0.15); border-radius: 10px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">当前剩余可用容量</div>
                        <div class="font-outfit" style="font-size: 22px; font-weight: 800; ${remaining < 10000 ? 'color: #f87171;' : 'color: var(--neon-cyan);'}">
                            ${remaining.toLocaleString()} <span style="font-size: 13px; font-weight: 500; color: var(--text-secondary);">m³</span>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">总核准容量</div>
                        <div class="font-outfit" style="font-size: 16px; font-weight: 700; color: var(--text-primary);">
                            ${quota.toLocaleString()} <span style="font-size: 12px; color: var(--text-secondary);">m³</span>
                        </div>
                    </div>
                </div>

                <div class="site-card-progress-wrap">
                    <div class="site-progress-bar-bg">
                        <div class="site-progress-bar-fill" style="width: ${usagePct}%; background: ${progressColor};"></div>
                    </div>
                    <div class="site-progress-stats">
                        <span>已消费: <strong class="text-white">${consumed.toLocaleString()} m³</strong> (${usagePct}%)</span>
                        <span>还剩: <strong style="${remaining < 10000 ? 'color: #f87171;' : 'color: var(--neon-cyan);'}">${remaining.toLocaleString()} m³</strong></span>
                    </div>
                </div>

                <!-- 各月明细（按需展开） -->
                <details style="font-size: 12px; border-top: 1px solid rgba(142, 170, 201, 0.12); padding-top: 8px; margin-top: 2px;">
                    <summary style="cursor: pointer; color: var(--text-secondary); padding: 4px 0; outline: none; user-select: none; display: flex; align-items: center; justify-content: space-between;">
                        <span><i class="fa-solid fa-chart-simple text-cyan" style="margin-right: 4px;"></i> 各月消费明细</span>
                        <span style="font-size: 11px; color: var(--neon-cyan);">点击展开/折叠</span>
                    </summary>
                    <div class="site-month-grid" style="margin-top: 8px;">
                        ${monthChipsHtml}
                    </div>
                </details>
            </div>
        `;
    }).join("");
}

function syncAbsorptiveSiteOptions(rows) {
    const select = dom.absorptiveSelectName;
    if (!select) return;
    const current = select.value;
    const names = [...new Set((rows || []).map(row => String(row.name || '').trim()).filter(Boolean))];
    select.innerHTML = '<option value="全部土点">全部土点 (' + names.length + '个土点总览)</option>' +
        names.map(name => '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>').join('');
    select.value = names.includes(current) ? current : '全部土点';
}

function renderMatrixUI(data, isFromCache = false) {
    cachedMatrixData = data;
    const summary = data.summary || {};
    const handledCap = summary.handled_capacity || 857750;
    const projVol = summary.total_project_volume || 938164;
    const unhandledVol = summary.unhandled_volume || 80414;

    if (dom.matrixHandledCapacity) dom.matrixHandledCapacity.textContent = `${handledCap.toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2})} m³`;
    if (dom.matrixProjectVolume) dom.matrixProjectVolume.textContent = `${projVol.toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2})} m³`;
    if (dom.matrixUnhandledVolume) dom.matrixUnhandledVolume.textContent = `${unhandledVol.toLocaleString('zh-CN', {minimumFractionDigits: 2, maximumFractionDigits: 2})} m³`;

    const rawRows = data.matrix || [];
    const matrixRows = sortMatrixRowsByExpiration(rawRows);
    syncAbsorptiveSiteOptions(matrixRows);
    const months = data.months || ["4月", "5月", "6月", "7月", "8月"];

    // Update Cache Snapshot Banner
    if (dom.absorptiveCacheTimeText) {
        const time = data.last_updated;
        if (time) {
            dom.absorptiveCacheTimeText.innerHTML = `数据快照时间: <strong class="text-white">${escapeHtml(time)}</strong> ${isFromCache ? '（已载入本地持久化数据，无需重复拉取）' : '（刚刚同步并已保存至本地）'}`;
        } else {
            dom.absorptiveCacheTimeText.textContent = "暂无历史查询快照，请点击【刷新最新消纳量】拉取官方最新数据";
        }
    }
    if (dom.absorptiveCacheStatusPill) {
        dom.absorptiveCacheStatusPill.innerHTML = (data.last_updated) 
            ? `<span class="badge badge-success">⚡ 本地快照秒开</span>` 
            : `<span class="badge badge-warning">⚠️ 待拉取同步</span>`;
    }

    // 1. Render Table Header (5 concise columns)
    const headerRow = $("absorptiveMatrixHeaderRow");
    if (headerRow) {
        headerRow.innerHTML = `
            <th style="text-align: left; min-width: 200px;">土点名称</th>
            <th style="width: 130px; text-align: right;">总核准容量</th>
            <th style="width: 130px; text-align: right;">累计已消纳</th>
            <th style="min-width: 150px; text-align: right; background: rgba(0,229,255,0.06); color: var(--neon-cyan);">当前剩余容量</th>
            <th style="min-width: 140px; text-align: center;">到期状态</th>
            <th style="width: 100px; text-align: center;">月度明细</th>
        `;
    }

    // 2. Render Table Rows
    if (dom.absorptiveMatrixTableBody) {
        if (!matrixRows.length) {
            dom.absorptiveMatrixTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="table-empty">
                        <i class="fa-solid fa-folder-open empty-icon"></i>
                        <p>未找到符合条件的土点消纳数据</p>
                    </td>
                </tr>
            `;
        } else {
            dom.absorptiveMatrixTableBody.innerHTML = matrixRows.map((row, idx) => {
                const isLowRemaining = row.remaining < 10000;
                const remainingStyle = isLowRemaining ? "color: #f87171; font-weight: 800;" : "color: var(--neon-cyan); font-weight: 700;";
                
                let monthlySummaryText = months.map(m => `${m}: ${(row.monthly && row.monthly[m]) ? row.monthly[m].toLocaleString() : '0'}`).join(" | ");

                return `
                    <tr>
                        <td style="font-weight: 700; color: var(--text-primary); text-align: left;">
                            <i class="fa-solid fa-mountain-city text-cyan" style="margin-right: 6px;"></i> ${escapeHtml(row.name)}
                        </td>
                        <td style="text-align: right; font-weight: 700; font-family: var(--font-outfit);">${row.total_quota.toLocaleString()} m³</td>
                        <td style="text-align: right; font-weight: 700; font-family: var(--font-outfit); color: var(--text-primary);">${row.total_consumed.toLocaleString()} m³</td>
                        <td style="text-align: right; font-family: var(--font-outfit); font-size: 15px; ${remainingStyle} background: rgba(0,229,255,0.03);">
                            ${row.remaining.toLocaleString()} m³
                        </td>
                        <td style="text-align: center;">${getExpireStatusBadge(row.expire_date)}</td>
                        <td style="text-align: center;">
                            <button class="btn btn-secondary btn-small" type="button" style="padding: 2px 8px; font-size: 11px;" title="${escapeHtml(monthlySummaryText)}" onclick="alert('${escapeHtml(row.name)} 各月明细：\\n${monthlySummaryText.replace(/ \| /g, '\\n')}')">
                                <i class="fa-solid fa-chart-simple text-cyan"></i> 明细
                            </button>
                        </td>
                    </tr>
                `;
            }).join("");
        }
    }

    // 3. Render Mobile Cards
    renderMatrixMobileCards(matrixRows, months);
}

async function loadLocalMatrixData() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/absorptive/local-matrix`, { cache: "no-store" });
        const data = await response.json();
        if (response.ok && data.success) {
            renderMatrixUI(data, true);
        }
    } catch (err) {
        console.warn("读取本地土点快照出错:", err);
    }
}

async function queryAbsorptiveMatrixStats() {
    if (!appConfig.authtoken) {
        alert("未发现服务授权密钥，请先在【接口配置】中保存或同步 authtoken！");
        return;
    }

    const selectedSite = dom.absorptiveSelectName ? dom.absorptiveSelectName.value : "全部土点";
    const curDate = new Date();
    const curYear = curDate.getFullYear();
    const curMonth = curDate.getMonth() + 1; // e.g. 8

    if (dom.queryMatrixStatsBtn) {
        dom.queryMatrixStatsBtn.disabled = true;
        dom.queryMatrixStatsBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> 正在拉取...`;
    }

    if (dom.absorptiveMatrixTableBody) {
        dom.absorptiveMatrixTableBody.innerHTML = `
            <tr>
                <td colspan="6" class="table-empty">
                    <i class="fa-solid fa-circle-notch fa-spin empty-icon" style="font-size: 24px;"></i>
                    <p>正在拉取 4月~${curMonth}月 [${escapeHtml(selectedSite)}] 消纳数据并保存快照，请稍候...</p>
                </td>
            </tr>
        `;
    }
    if (dom.absorptiveMobileCardsContainer) {
        dom.absorptiveMobileCardsContainer.innerHTML = `
            <div class="glass-panel" style="text-align: center; padding: 30px 20px; color: var(--text-secondary);">
                <i class="fa-solid fa-circle-notch fa-spin empty-icon" style="font-size: 28px; margin-bottom: 8px;"></i>
                <p>正在拉取 4月~${curMonth}月 [${escapeHtml(selectedSite)}] 消纳数据并保存快照，请稍候...</p>
            </div>
        `;
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/absorptive/matrix-stats`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                authtoken: appConfig.authtoken,
                absorptivename: selectedSite === "全部土点" ? "" : selectedSite,
                year: curYear,
                startMonth: 4,
                endMonth: curMonth,
                totalProjectVolume: 938164.0
            })
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error((data.detail && typeof data.detail === 'string') ? data.detail : "查询失败");
        }

        renderMatrixUI(data, false);

    } catch (err) {
        if (dom.absorptiveMatrixTableBody) {
            dom.absorptiveMatrixTableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="table-empty text-red">
                        <i class="fa-solid fa-triangle-exclamation empty-icon" style="color: #f87171;"></i>
                        <p>查询失败: ${escapeHtml(err.message)}</p>
                    </td>
                </tr>
            `;
        }
        if (dom.absorptiveMobileCardsContainer) {
            dom.absorptiveMobileCardsContainer.innerHTML = `
                <div class="glass-panel text-red" style="text-align: center; padding: 20px;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size: 28px; color: #f87171; margin-bottom: 8px;"></i>
                    <p>查询失败: ${escapeHtml(err.message)}</p>
                </div>
            `;
        }
    } finally {
        if (dom.queryMatrixStatsBtn) {
            dom.queryMatrixStatsBtn.disabled = false;
            dom.queryMatrixStatsBtn.innerHTML = `<i class="fa-solid fa-rotate"></i> 刷新最新消纳量`;
        }
    }
}

// --- Waybill query implementation ---
function initWaybillDates() {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}-${mm}-${dd}`;
    
    if (dom.waybillFilterStarTime) dom.waybillFilterStarTime.value = dateStr;
    if (dom.waybillFilterEndTime) dom.waybillFilterEndTime.value = dateStr;
}

async function queryWaybills() {
    if (!appConfig.authtoken) {
        alert("未发现服务配置密钥，请确认已同步最新密钥。");
        return;
    }

    dom.waybillQueryBtn.disabled = true;
    const originalHtml = dom.waybillQueryBtn.innerHTML;
    dom.waybillQueryBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> 查询中...`;

    dom.waybillsTableBody.innerHTML = `
        <tr>
            <td colspan="9" class="table-empty">
                <i class="fa-solid fa-circle-notch fa-spin empty-icon" style="font-size: 24px;"></i>
                <p>正在读取目标运单中枢数据，请稍候...</p>
            </td>
        </tr>
    `;
    setDisplay(dom.waybillsTablePanelSection, "block");
    setDisplay(dom.waybillSummaryStats, "none");

    const searchCode = dom.waybillFilterCode.value.trim();
    // If searchCode is not empty and does not start with "YD" (waybill code prefix), it is a plate search
    const isPlateSearch = searchCode && !searchCode.toUpperCase().startsWith("YD");

    const payload = {
        authtoken: appConfig.authtoken,
        page: 1,
        limit: isPlateSearch ? 500 : (parseInt(dom.waybillFilterLimit.value) || 50),
        id: dom.waybillFilterWorksiteId.value.trim(),
        state: isPlateSearch ? "" : dom.waybillFilterState.value, // Fetch all states to filter locally
        starTime: dom.waybillFilterStarTime.value,
        endTime: dom.waybillFilterEndTime.value,
        code: isPlateSearch ? "" : searchCode
    };

    try {
        const response = await fetch(`${BACKEND_URL}/api/waybills`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error((data.detail && typeof data.detail === 'string') ? data.detail : "目标中枢服务响应异常");
        }

        const resultObj = data.result || {};
        let rows = resultObj.rows || [];
        let total = resultObj.total ?? 0;
        let count = resultObj.count ?? 0.0;

        if (isPlateSearch) {
            const upperSearch = searchCode.toUpperCase();
            rows = rows.filter(item => 
                (item.carnumberplate && item.carnumberplate.toUpperCase().includes(upperSearch)) ||
                (item.code && item.code.toUpperCase().includes(upperSearch))
            );
            
            // Re-apply state filter locally if selected
            const selectedState = dom.waybillFilterState.value;
            if (selectedState) {
                rows = rows.filter(item => item.state === selectedState);
            }
            
            total = rows.length;
            count = rows.reduce((sum, item) => sum + (parseFloat(item.transportinoutnum) || 0), 0);
        }

        dom.waybillStatsDisplay.textContent = `共检索到 ${total} 条运单记录 (当前页展示 ${rows.length} 条)`;
        
        if (count > 0) {
            setDisplay(dom.waybillSummaryStats, "flex");
            dom.waybillTotalTonnage.textContent = Number(count).toFixed(2);
        } else {
            setDisplay(dom.waybillSummaryStats, "none");
        }

        if (!rows.length) {
            renderEmptyTable(dom.waybillsTableBody, 9, "未检索到匹配的运单记录！");
        } else {
            dom.waybillsTableBody.innerHTML = rows.map(item => {
                let stateHtml = "";
                if (item.state === "运输中") {
                    stateHtml = `<span class="badge-shipping">运输中</span>`;
                } else if (item.state === "已完成") {
                    stateHtml = `<span class="badge-completed">已完成</span>`;
                } else if (item.state === "异常") {
                    stateHtml = `<span class="badge-error">异常</span>`;
                } else if (item.state === "违规运单") {
                    stateHtml = `<span class="badge-warning">违规运单</span>`;
                } else {
                    stateHtml = `<span class="status-text">${escapeHtml(item.state || "-")}</span>`;
                }

                return `
                    <tr>
                        <td style="text-align: center;">${stateHtml}</td>
                        <td style="font-weight: 700; color: var(--text-primary);">${escapeHtml(item.carnumberplate || "-")}</td>
                        <td style="text-align: left; font-size: 13px;">${escapeHtml(item.worksitename || "-")}</td>
                        <td style="text-align: left; font-size: 13px;">${escapeHtml(item.absorptivename || "-")}</td>
                        <td style="text-align: left; font-size: 13px;">${escapeHtml(item.transportname || "-")}</td>
                        <td>${escapeHtml(item.rubbishtype || "-")}</td>
                        <td style="text-align: center; font-weight: 700; color: var(--neon-cyan);">${escapeHtml(item.transportinoutnum || "-")}</td>
                        <td style="text-align: center; font-size: 12px; color: var(--text-secondary);">${escapeHtml(item.leavetime || "-")}</td>
                        <td style="text-align: center; font-size: 12px; color: var(--text-secondary);">${escapeHtml(item.arrivetime || "-")}</td>
                    </tr>
                `;
            }).join("");
        }
    } catch (err) {
        renderEmptyTable(dom.waybillsTableBody, 9, `查询失败：${err.message}`);
        dom.waybillStatsDisplay.textContent = `查询异常`;
        setDisplay(dom.waybillSummaryStats, "none");
    } finally {
        dom.waybillQueryBtn.disabled = false;
        dom.waybillQueryBtn.innerHTML = originalHtml;
    }
}

function renderEmptyTable(tableBody, colSpan, message) {
    if (tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="${colSpan}" class="table-empty">
                    <i class="fa-solid fa-folder-open empty-icon"></i>
                    <p>${escapeHtml(message)}</p>
                </td>
            </tr>
        `;
    }
}

function resetWaybillFilters() {
    if (dom.waybillFilterWorksiteId) dom.waybillFilterWorksiteId.value = "";
    if (dom.waybillFilterCode) dom.waybillFilterCode.value = "";
    initWaybillDates();
    if (dom.waybillFilterLimit) dom.waybillFilterLimit.value = "20";
    
    // Reset state pills
    if (dom.waybillFilterState) dom.waybillFilterState.value = "";
    const pills = document.querySelectorAll(".status-pill");
    pills.forEach(p => p.classList.remove("active"));
    const allPill = document.querySelector(".status-pill[data-state='']");
    if (allPill) allPill.classList.add("active");
    
    queryWaybills();
}

function handleWaybillStatePillClick(event) {
    const pill = event.target.closest(".status-pill");
    if (!pill) return;
    
    const pills = document.querySelectorAll(".status-pill");
    pills.forEach(p => p.classList.remove("active"));
    
    pill.classList.add("active");
    const stateValue = pill.dataset.state;
    dom.waybillFilterState.value = stateValue;
    
    queryWaybills();
}

function toggleAdvancedFilters() {
    const panel = dom.advancedFiltersPanel;
    if (!panel) return;
    if (panel.style.display === "none" || !panel.style.display) {
        setDisplay(panel, "block");
        dom.toggleAdvancedFiltersBtn.innerHTML = `<i class="fa-solid fa-chevron-up"></i> 收起筛选`;
    } else {
        setDisplay(panel, "none");
        dom.toggleAdvancedFiltersBtn.innerHTML = `<i class="fa-solid fa-sliders"></i> 高级筛选`;
    }
}

// --- QR code helper implementation ---
async function loadQrConfig() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/qr-helper/config`, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.success) {
            qrVehiclesList = data.vehicles || [];
            qrTemplates = data.templates || qrTemplates;
            
            // Sync with local storage
            localStorage.setItem(QR_STORAGE_KEY, JSON.stringify(qrVehiclesList));
            
            // Fallback load local storage if empty
            if (qrVehiclesList.length === 0) {
                const stored = localStorage.getItem(QR_STORAGE_KEY);
                if (stored) qrVehiclesList = JSON.parse(stored);
            }
            renderQrGrid();
        }
    } catch (err) {
        console.error("加载二维码助手配置失败:", err);
        const stored = localStorage.getItem(QR_STORAGE_KEY);
        if (stored) {
            qrVehiclesList = JSON.parse(stored);
            renderQrGrid();
        }
    }
}

async function saveQrConfigToServer() {
    try {
        const response = await fetch(`${BACKEND_URL}/api/qr-helper/config`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                vehicles: qrVehiclesList,
                templates: qrTemplates
            })
        });
        const data = await response.json();
        if (!data.success) {
            console.error("Failed to save QR configuration to server.");
        }
    } catch (err) {
        console.error("API error while saving QR configuration:", err);
    }
}

function renderQrGrid() {
    if (!dom.qrVehiclesGrid) return;
    
    if (qrVehiclesList.length === 0) {
        dom.qrVehiclesGrid.innerHTML = `
            <div class="glass-panel" style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--text-secondary);">
                <i class="fa-solid fa-qrcode" style="font-size: 40px; color: rgba(255,255,255,0.15); margin-bottom: 16px; display: block;"></i>
                <p style="font-size: 15px; font-weight: 600; margin-bottom: 8px;">本地尚未配置固定车辆</p>
                <p style="font-size: 13px; margin-bottom: 16px;">您可以一键批量添加常用备案车牌</p>
                <button class="btn btn-primary btn-small" onclick="openBatchAddModal()">
                    <i class="fa-solid fa-plus"></i> 批量导入车辆
                </button>
            </div>
        `;
        return;
    }

    // Sort vehicles: enabled first, disabled last
    const sortedVehicles = [...qrVehiclesList].sort((a, b) => {
        const aEnabled = a.enabled !== false ? 1 : 0;
        const bEnabled = b.enabled !== false ? 1 : 0;
        return bEnabled - aEnabled;
    });

    dom.qrVehiclesGrid.innerHTML = sortedVehicles.map(vehicle => {
        const isNEV = isNewEnergyVehicle(vehicle.plate);
        const plateClass = isNEV ? "plate-green" : "plate-blue";
        const isWaitWorksite = vehicle.status === 0;
        const isEnabled = vehicle.enabled !== false;
        
        let worksiteBtnClass = "btn-qr-action";
        let dumpBtnClass = "btn-qr-action";
        let worksiteBtnText = "";
        let dumpBtnText = "";
        let worksiteBtnAttr = "";
        let dumpBtnAttr = "";
        let cardClass = isEnabled ? "qr-vehicle-card" : "qr-vehicle-card disabled-card";

        const hasQr = !!(vehicle.qrImage || vehicle.worksiteQrImage || vehicle.dumpQrImage);

        if (!isEnabled) {
            worksiteBtnClass += " btn-qr-disabled";
            worksiteBtnText = `<i class="fa-solid fa-ban"></i> 队列已关`;
            worksiteBtnAttr = "disabled";
            
            dumpBtnClass += " btn-qr-disabled";
            dumpBtnText = `<i class="fa-solid fa-ban"></i> 队列已关`;
            dumpBtnAttr = "disabled";
        } else if (isWaitWorksite) {
            if (hasQr) {
                worksiteBtnClass += " btn-qr-worksite pulse-glow-blue";
                worksiteBtnText = `<i class="fa-solid fa-qrcode"></i> 扫工地`;
            } else {
                worksiteBtnClass += " btn-qr-unuploaded";
                worksiteBtnText = `<i class="fa-solid fa-qrcode"></i> 待备码`;
            }
            
            dumpBtnClass += " btn-qr-locked";
            dumpBtnAttr = "disabled";
            dumpBtnText = `<i class="fa-solid fa-lock"></i> 待扫工地`;
        } else {
            worksiteBtnClass += " btn-qr-done";
            worksiteBtnText = `<i class="fa-solid fa-circle-check"></i> 工地已扫`;
            worksiteBtnAttr = "disabled";
            
            if (hasQr) {
                dumpBtnClass += " btn-qr-dump pulse-glow-orange";
                dumpBtnText = `<i class="fa-solid fa-qrcode"></i> 扫土点`;
            } else {
                dumpBtnClass += " btn-qr-unuploaded";
                dumpBtnText = `<i class="fa-solid fa-qrcode"></i> 待备码`;
            }
        }

        const worksiteTimeStr = vehicle.worksiteTime ? escapeHtml(vehicle.worksiteTime) : "--:--:--";
        const dumpTimeStr = vehicle.dumpTime ? escapeHtml(vehicle.dumpTime) : "--:--:--";

        return `
            <div class="${cardClass}" data-plate="${escapeHtml(vehicle.plate)}">
                <div class="qr-card-header">
                    <span class="qr-plate ${plateClass}">${escapeHtml(vehicle.plate)}</span>
                    <div style="display: flex; gap: 6px; align-items: center;">
                        <label class="switch-toggle" title="启用/禁用车辆">
                            <input type="checkbox" ${isEnabled ? 'checked' : ''} onchange="toggleVehicleEnabled('${escapeHtml(vehicle.plate)}', this.checked)">
                            <span class="switch-slider"></span>
                        </label>
                        <button class="qr-edit-btn" onclick="openEditQrModal('${escapeHtml(vehicle.plate)}')" title="编辑二维码">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                    </div>
                </div>
                <div class="qr-action-area">
                    <div class="qr-action-row">
                        <button class="${worksiteBtnClass}" ${worksiteBtnAttr} onclick="openQrCodeModal('${escapeHtml(vehicle.plate)}', 'worksite')">
                            ${worksiteBtnText}
                        </button>
                        <span class="qr-action-time" title="上次扫码时间">${worksiteTimeStr}</span>
                    </div>
                    <div class="qr-action-row">
                        <button class="${dumpBtnClass}" ${dumpBtnAttr} onclick="openQrCodeModal('${escapeHtml(vehicle.plate)}', 'dump')">
                            ${dumpBtnText}
                        </button>
                        <span class="qr-action-time" title="上次扫码时间">${dumpTimeStr}</span>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

// Bind to window for HTML rendering callback
window.toggleVehicleEnabled = function(plate, checked) {
    const vehicle = qrVehiclesList.find(v => v.plate === plate);
    if (vehicle) {
        vehicle.enabled = checked;
        localStorage.setItem(QR_STORAGE_KEY, JSON.stringify(qrVehiclesList));
        saveQrConfigToServer();
        renderQrGrid();
    }
};

window.deleteQrVehicle = function(plate) {
    if (!confirm(`确定要从扫码助手中删除车牌 ${plate} 吗？`)) return;
    qrVehiclesList = qrVehiclesList.filter(v => v.plate !== plate);
    localStorage.setItem(QR_STORAGE_KEY, JSON.stringify(qrVehiclesList));
    saveQrConfigToServer();
    renderQrGrid();
};

window.openQrCodeModal = async function(plate, type) {
    const card = document.querySelector(`.qr-vehicle-card[data-plate="${plate}"]`);
    let targetBtn = null;
    let originalHtml = "";
    if (card) {
        targetBtn = card.querySelector(type === "worksite" ? ".btn-qr-worksite" : ".btn-qr-dump");
        if (targetBtn) {
            originalHtml = targetBtn.innerHTML;
            targetBtn.disabled = true;
            targetBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> 校验中`;
        }
    }

    const validation = await checkWaybillStatus(plate, type, "open");
    
    if (targetBtn) {
        targetBtn.disabled = false;
        targetBtn.innerHTML = originalHtml;
    }

    let proceed = false;
    if (validation.success) {
        proceed = true;
    } else {
        let warnMsg = "";
        if (validation.reason === "already_in_transit") {
            warnMsg = `⚠️ 警告：检测到该车辆当前已有一个【运输中】状态的运单！\n\n这说明该车辆已在运输中，无需重复进行“扫工地”登记。是否仍要强行查看二维码？`;
        } else if (validation.reason === "no_active_waybill") {
            warnMsg = `⚠️ 警告：检测到该车辆目前没有【运输中】状态的运单！\n\n这说明该车辆尚未开始本次运输，无法进行“扫土点”登记。是否仍要强行查看二维码？`;
        } else if (validation.reason === "api_error") {
            warnMsg = `⚠️ 网络或系统校验失败：${validation.message || "请求超时"}\n\n当前无法校验该车在官方运单中枢的最新状态。是否仍要强行查看二维码？`;
        } else if (validation.reason === "missing_token") {
            warnMsg = `⚠️ 系统接口未就绪：authtoken 缺失，无法与官方运单中枢进行数据校验！是否仍要强行查看二维码？`;
        } else {
            warnMsg = `⚠️ 运单校验未通过。是否仍要强行查看二维码？`;
        }
        proceed = await showCustomConfirm("校验警告", warnMsg);
    }

    if (!proceed) return;

    activeQrVehiclePlate = plate;
    activeQrType = type;

    const vehicle = qrVehiclesList.find(v => v.plate === plate);
    dom.qrCodePlateDisplay.textContent = plate;

    if (type === "worksite") {
        dom.qrCodeModalTitle.innerHTML = `<i class="fa-solid fa-building-shield"></i> 工地扫码认证`;
        dom.qrCodeStepBadge.textContent = "第一步 / 扫工地";
        dom.qrCodeStepBadge.className = "qr-code-step-badge";
        dom.qrCodeStepBadge.style.borderColor = "var(--neon-cyan)";
        dom.qrCodeStepBadge.style.color = "var(--neon-cyan)";
        dom.qrCodeStepTitle.textContent = "请司机使用手机扫描下方二维码";
        dom.confirmQrScannedBtn.className = "btn btn-success";
        dom.confirmQrScannedBtn.style.background = ""; 
        dom.confirmQrScannedBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> 确认已扫码`;
    } else {
        dom.qrCodeModalTitle.innerHTML = `<i class="fa-solid fa-mountain"></i> 消纳土点扫码`;
        dom.qrCodeStepBadge.textContent = "第二步 / 扫土点";
        dom.qrCodeStepBadge.className = "qr-code-step-badge";
        dom.qrCodeStepBadge.style.borderColor = "var(--neon-orange)";
        dom.qrCodeStepBadge.style.color = "var(--neon-orange)";
        dom.qrCodeStepTitle.textContent = "请司机使用手机扫描下方二维码";
        dom.confirmQrScannedBtn.className = "btn btn-success";
        dom.confirmQrScannedBtn.style.background = "linear-gradient(180deg, #d99726 0%, var(--neon-orange) 100%)";
        dom.confirmQrScannedBtn.innerHTML = `<i class="fa-solid fa-circle-check"></i> 确认已扫码`;
    }

    const imgData = vehicle ? vehicle.qrImage : null;
    if (imgData) {
        dom.qrCodeImage.src = imgData;
        setDisplay(dom.qrCodeImage, "block");
        setDisplay(dom.qrCodeImageFallback, "none");
    } else {
        dom.qrCodeImage.src = "";
        setDisplay(dom.qrCodeImage, "none");
        setDisplay(dom.qrCodeImageFallback, "block");
    }

    if (dom.confirmQrScannedBtn) {
        dom.confirmQrScannedBtn.disabled = false;
    }
    dom.qrCodeModal.classList.add("active");
};

function closeAllModals() {
    if (dom.qrCodeModal) dom.qrCodeModal.classList.remove("active");
    if (dom.batchAddModal) dom.batchAddModal.classList.remove("active");
    if (dom.editQrModal) dom.editQrModal.classList.remove("active");
    if (dom.customConfirmModal) dom.customConfirmModal.classList.remove("active");
    
    // Resolve any pending confirm dialog
    if (activeCustomConfirmResolve) {
        activeCustomConfirmResolve(false);
        activeCustomConfirmResolve = null;
    }
    if (activeCustomConfirmCleanUp) {
        activeCustomConfirmCleanUp();
    }
    
    activeQrVehiclePlate = null;
    activeQrType = null;
}

function showCustomConfirm(title, message) {
    if (activeCustomConfirmResolve) {
        activeCustomConfirmResolve(false);
    }
    if (activeCustomConfirmCleanUp) {
        activeCustomConfirmCleanUp();
    }
    return new Promise((resolve) => {
        activeCustomConfirmResolve = resolve;
        
        const modal = dom.customConfirmModal;
        const titleEl = dom.customConfirmTitle;
        const messageEl = dom.customConfirmMessage;
        const closeBtn = dom.closeCustomConfirmModalBtn;
        const cancelBtn = dom.cancelCustomConfirmBtn;
        const confirmBtn = dom.confirmCustomConfirmBtn;

        if (!modal || !messageEl) {
            resolve(confirm(message));
            activeCustomConfirmResolve = null;
            return;
        }

        if (titleEl) {
            titleEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation animate-pulse"></i> ${escapeHtml(title)}`;
        }
        messageEl.textContent = message;

        const cleanUp = () => {
            modal.classList.remove("active");
            closeBtn.removeEventListener("click", onCancel);
            cancelBtn.removeEventListener("click", onCancel);
            confirmBtn.removeEventListener("click", onConfirm);
            activeCustomConfirmResolve = null;
            activeCustomConfirmCleanUp = null;
        };
        activeCustomConfirmCleanUp = cleanUp;

        const onCancel = () => {
            cleanUp();
            resolve(false);
        };

        const onConfirm = () => {
            cleanUp();
            resolve(true);
        };

        closeBtn.addEventListener("click", onCancel);
        cancelBtn.addEventListener("click", onCancel);
        confirmBtn.addEventListener("click", onConfirm);

        modal.classList.add("active");
    });
}

function getQueryDateRange() {
    let starTime = dom.waybillFilterStarTime ? dom.waybillFilterStarTime.value : "";
    let endTime = dom.waybillFilterEndTime ? dom.waybillFilterEndTime.value : "";
    
    if (!starTime || !endTime) {
        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const dateStr = `${yyyy}-${mm}-${dd}`;
        starTime = starTime || dateStr;
        endTime = endTime || dateStr;
    }
    return { starTime, endTime };
}

async function checkWaybillStatus(plate, type, stage) {
    if (!appConfig.authtoken) {
        return { success: false, reason: "missing_token" };
    }

    const { starTime, endTime } = getQueryDateRange();
    
    const payload = {
        authtoken: appConfig.authtoken,
        page: 1,
        limit: 500, // Fetch more to cover all waybills of the day for local filtering
        id: "",
        state: "", // Fetch all to check combinations of transit / completed
        starTime: starTime,
        endTime: endTime,
        code: "" // Remote API only supports exact matching on waybill code, so we fetch all and filter locally by plate
    };

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout
        
        const response = await fetch(`${BACKEND_URL}/api/waybills`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();
        if (!data.success || !data.result) {
            throw new Error(data.message || data.msg || "接口返回异常");
        }

        const rows = data.result.rows || [];
        
        // Filter rows by current plate
        const vehicleRows = rows.filter(item => item.carnumberplate === plate);
        const activeInTransit = vehicleRows.find(item => item.state === "运输中");
        
        if (stage === "open") {
            if (type === "worksite") {
                // Worksite scan is BLOCKED if there is already an active waybill in transit
                if (activeInTransit) {
                    return { success: false, reason: "already_in_transit", waybill: activeInTransit };
                } else {
                    return { success: true };
                }
            } else {
                // Dump scan requires an active waybill in transit
                if (activeInTransit) {
                    return { success: true, waybill: activeInTransit };
                } else {
                    return { success: false, reason: "no_active_waybill" };
                }
            }
        } else {
            // stage === "confirm"
            if (type === "worksite") {
                // Confirming worksite scan requires that a new in-transit waybill HAS appeared
                if (activeInTransit) {
                    return { success: true, waybill: activeInTransit };
                } else {
                    return { success: false, reason: "no_in_transit_waybill" };
                }
            } else {
                // Confirming dump scan requires a recently completed waybill (within last 15 minutes)
                const completedWaybills = vehicleRows.filter(item => item.state === "已完成");
                const now = new Date();
                let isRecent = false;
                let targetWaybill = null;
                
                for (const item of completedWaybills) {
                    if (!item.arrivetime) continue;
                    const arriveDate = new Date(item.arrivetime.replace(/-/g, "/"));
                    const diffMs = now - arriveDate;
                    const diffMins = diffMs / (1000 * 60);
                    
                    // Allow clock tolerance (15 minutes drift either way)
                    if (Math.abs(diffMins) <= 15) {
                        isRecent = true;
                        targetWaybill = item;
                        break;
                    }
                }
                
                if (isRecent) {
                    return { success: true, waybill: targetWaybill };
                } else {
                    return { success: false, reason: "no_recent_completed_waybill" };
                }
            }
        }
    } catch (err) {
        console.error("运单状态校验请求出错:", err);
        const errMsg = err.name === "AbortError" ? "请求超时" : err.message;
        return { success: false, reason: "api_error", message: errMsg };
    }
}

async function processQrScannedConfirm() {
    if (!activeQrVehiclePlate || !activeQrType) return;

    const confirmBtn = dom.confirmQrScannedBtn;
    const originalText = confirmBtn.innerHTML;
    const originalStyle = confirmBtn.style.background;
    
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> 校验中...`;
    confirmBtn.style.background = "#4b5563"; // gray out

    const validation = await checkWaybillStatus(activeQrVehiclePlate, activeQrType, "confirm");
    
    let proceed = false;
    if (validation.success) {
        proceed = true;
    } else {
        let warnMsg = "";
        if (validation.reason === "no_in_transit_waybill") {
            warnMsg = `⚠️ 警告：未在系统中检测到该车辆处于【运输中】的运单！\n\n这可能意味着司机尚未成功生成发车订单（漏扫工地）。是否仍要强行确认？`;
        } else if (validation.reason === "no_recent_completed_waybill") {
            warnMsg = `⚠️ 警告：未检测到该车辆最近 15 分钟内有【已完成】的运单记录！\n\n这可能意味着消纳点扫码暂未成功上报。是否仍要强行确认？`;
        } else if (validation.reason === "api_error") {
            warnMsg = `⚠️ 网络或系统校验失败：${validation.message || "请求超时"}\n\n当前无法校验最新状态。是否仍要强行确认？`;
        } else if (validation.reason === "missing_token") {
            warnMsg = `⚠️ 系统接口未就绪：authtoken 缺失。是否仍要强行确认？`;
        } else {
            warnMsg = `⚠️ 运单校验未通过。是否仍要强行确认？`;
        }
        proceed = await showCustomConfirm("校验警告", warnMsg);
    }

    if (proceed) {
        const vehicle = qrVehiclesList.find(v => v.plate === activeQrVehiclePlate);
        if (vehicle) {
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, "0");
            const mm = String(now.getMinutes()).padStart(2, "0");
            const ss = String(now.getSeconds()).padStart(2, "0");
            const timeStr = `${hh}:${mm}:${ss}`;
            vehicle.lastScannedTime = timeStr;

            if (activeQrType === "worksite") {
                vehicle.status = 1; // Mark Worksited, waiting dump
                vehicle.worksiteTime = timeStr;
            } else {
                vehicle.status = 0; // Completed scan cycle, reset to worksite scan
                vehicle.dumpTime = timeStr;
            }
            
            localStorage.setItem(QR_STORAGE_KEY, JSON.stringify(qrVehiclesList));
            closeAllModals(); // Close modal instantly for snappy UX
            
            await saveQrConfigToServer();
            renderQrGrid();
        } else {
            closeAllModals();
        }
    } else {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = originalText;
        confirmBtn.style.background = originalStyle;
    }
}

window.openBatchAddModal = function() {
    closeAllModals();
    if (dom.batchAddModal) {
        dom.batchAddTextArea.value = "";
        dom.batchAddModal.classList.add("active");
        dom.batchAddTextArea.focus();
    }
};

function handleBatchAddSubmit() {
    const text = dom.batchAddTextArea.value;
    const lines = text.split(/[\n,，\s\t]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    if (lines.length === 0) {
        alert("请输入要批量添加的车牌号码。");
        return;
    }

    let addedCount = 0;
    lines.forEach(plate => {
        // Clean formats
        const cleanPlate = plate.replace(/\s+/g, "");
        if (cleanPlate.length >= 7 && cleanPlate.length <= 8) {
            const exists = qrVehiclesList.some(v => v.plate === cleanPlate);
            if (!exists) {
                qrVehiclesList.push({
                    plate: cleanPlate,
                    status: 0,
                    worksiteTime: null,
                    dumpTime: null,
                    enabled: true,
                    qrImage: null
                });
                addedCount++;
            }
        }
    });

    if (addedCount > 0) {
        localStorage.setItem(QR_STORAGE_KEY, JSON.stringify(qrVehiclesList));
        saveQrConfigToServer();
        renderQrGrid();
        alert(`成功新增 ${addedCount} 辆备案车辆！`);
    } else {
        alert("未增加任何车辆（可能车牌格式有误或全部已存在于助手中）。");
    }
    closeAllModals();
}

window.openEditQrModal = function(plate) {
    closeAllModals();
    activeQrVehiclePlate = plate;
    const vehicle = qrVehiclesList.find(v => v.plate === plate);
    if (!vehicle) return;

    dom.editQrPlateDisplay.textContent = plate;
    const isNEV = isNewEnergyVehicle(plate);
    dom.editQrPlateDisplay.className = `qr-plate ${isNEV ? 'plate-green' : 'plate-blue'}`;
    updateUploadPreview(vehicle.qrImage);
    dom.editQrModal.classList.add("active");
};

function updateUploadPreview(dataUrl) {
    if (dataUrl) {
        dom.vehicleQrPreviewBox.innerHTML = `<img src="${dataUrl}" style="width:100%; height:100%; object-fit:contain;" alt="QR Code">`;
        dom.vehicleUploadStatus.textContent = "已上传";
        dom.vehicleUploadStatus.className = "text-green";
        setDisplay(dom.deleteVehicleQrBtn, "inline-flex");
    } else {
        dom.vehicleQrPreviewBox.innerHTML = `<i class="fa-solid fa-image" style="font-size: 24px; color: rgba(255,255,255,0.15);"></i>`;
        dom.vehicleUploadStatus.textContent = "未上传";
        dom.vehicleUploadStatus.className = "";
        setDisplay(dom.deleteVehicleQrBtn, "none");
    }
}

function handleSaveEditQr() {
    if (!activeQrVehiclePlate) return;
    const vehicle = qrVehiclesList.find(v => v.plate === activeQrVehiclePlate);
    if (vehicle) {
        const img = dom.vehicleQrPreviewBox.querySelector("img");
        vehicle.qrImage = img ? img.src : null;
        localStorage.setItem(QR_STORAGE_KEY, JSON.stringify(qrVehiclesList));
        saveQrConfigToServer();
        renderQrGrid();
    }
    closeAllModals();
}

function handleResetAllVehicles() {
    if (qrVehiclesList.length === 0) return;
    if (!confirm("确定要一键将所有车辆重置为“等待扫工地”状态并清空扫码时间戳吗？")) return;
    
    qrVehiclesList.forEach(v => {
        v.status = 0;
        v.worksiteTime = null;
        v.dumpTime = null;
        v.lastScannedTime = null;
    });

    localStorage.setItem(QR_STORAGE_KEY, JSON.stringify(qrVehiclesList));
    saveQrConfigToServer();
    renderQrGrid();
    alert("所有车辆的流程状态已重置完成。");
}

// Compress uploaded images
function compressImage(file, callback) {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = event => {
        const img = new Image();
        img.src = event.target.result;
        img.onload = () => {
            const canvas = document.createElement("canvas");
            const maxW = 400;
            const maxH = 400;
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxW) {
                    height = Math.round((height * maxW) / width);
                    width = maxW;
                }
            } else {
                if (height > maxH) {
                    width = Math.round((width * maxH) / height);
                    height = maxH;
                }
            }

            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0, width, height);
            
            // Output compressed base64
            const compressed = canvas.toDataURL("image/jpeg", 0.7);
            callback(compressed);
        };
    };
}

// System configuration helper functions
function setLoginStatus(message, type = "") {
    if (!dom.loginStatus) return;
    dom.loginStatus.textContent = message;
    dom.loginStatus.className = `form-help ${type}`.trim();
}

function formatApiErrorDetail(detail, fallback = "请求失败") {
    if (!detail) return fallback;
    if (typeof detail === "string") return detail;

    const message = detail.message || detail.msg || fallback;
    const remote = detail.remote || detail;
    if (!remote || typeof remote !== "object") {
        return message;
    }

    const parts = [message];
    const summary = {};
    ["code", "message", "msg", "success", "result"].forEach(key => {
        if (Object.prototype.hasOwnProperty.call(remote, key)) {
            summary[key] = remote[key];
        }
    });

    if (Object.keys(summary).length) {
        parts.push(JSON.stringify(summary, null, 2));
    }
    return parts.join("\n");
}

async function loadCaptcha(options = {}) {
    const preserveStatus = Boolean(options.preserveStatus);
    if (!dom.refreshCaptchaBtn || !dom.captchaImage) return;

    dom.refreshCaptchaBtn.disabled = true;
    dom.captchaImage.removeAttribute("src");
    if (!preserveStatus) {
        setLoginStatus("正在获取验证码...");
    }

    try {
        const response = await fetch(`${BACKEND_URL}/api/login/captcha`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok || !data.success) {
            throw new Error(formatApiErrorDetail(data.detail, "验证码获取失败"));
        }

        captchaUuid = data.uuid || "";
        dom.captchaImage.src = data.img;
        dom.captchaCodeInput.value = "";
        if (!preserveStatus) {
            setLoginStatus("请输入图片验证码后点击登录。");
            dom.captchaCodeInput.focus();
        }
    } catch (err) {
        captchaUuid = "";
        if (!preserveStatus) {
            setLoginStatus(`验证码获取失败: ${err.message}`, "error");
        }
    } finally {
        dom.refreshCaptchaBtn.disabled = false;
    }
}

function applyAuthtoken(token) {
    appConfig = {
        authtoken: token,
        id: dom.worksiteIdInput.value.trim() || appConfig.id || "225642",
        worksitetype: dom.worksiteTypeInput.value.trim() || appConfig.worksitetype || "1"
    };
    dom.tokenInput.value = token;
    localStorage.setItem(CONFIG_KEY, JSON.stringify(appConfig));
}

async function loginAndSaveToken() {
    const username = dom.loginUsernameInput.value.trim();
    const password = dom.loginPasswordInput.value;
    const code = dom.captchaCodeInput.value.trim();

    if (!username || !password || !code) {
        setLoginStatus("请填写账号、密码和验证码。", "error");
        return;
    }

    dom.autoLoginBtn.disabled = true;
    const originalHtml = dom.autoLoginBtn.innerHTML;
    dom.autoLoginBtn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> 正在登录...`;
    setLoginStatus("正在提交登录请求...");

    try {
        const response = await fetch(`${BACKEND_URL}/api/login/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username,
                password,
                code,
                uuid: captchaUuid
            })
        });
        const data = await response.json();

        if (!response.ok || !data.success || !data.authtoken) {
            throw new Error(formatApiErrorDetail(data.detail, "登录失败"));
        }

        applyAuthtoken(data.authtoken);
        dom.loginPasswordInput.value = "";
        dom.captchaCodeInput.value = "";
        setLoginStatus("Token 已获取并保存。", "success");
    } catch (err) {
        setLoginStatus(`登录失败: ${err.message}`, "error");
        await loadCaptcha({ preserveStatus: true });
    } finally {
        dom.autoLoginBtn.disabled = false;
        dom.autoLoginBtn.innerHTML = originalHtml;
    }
}

async function saveConfig() {
    const authtoken = dom.tokenInput.value.trim();
    const worksiteId = dom.worksiteIdInput.value.trim() || "225642";
    const worksiteType = dom.worksiteTypeInput.value.trim() || "1";

    appConfig = {
        authtoken: authtoken,
        id: worksiteId,
        worksitetype: worksiteType
    };
    
    // Save to localStorage
    localStorage.setItem(CONFIG_KEY, JSON.stringify(appConfig));

    // Save to backend CONFIG_FILE using POST /api/admin/system-config
    try {
        dom.saveConfigBtn.disabled = true;
        const response = await fetch(`${BACKEND_URL}/api/admin/system-config`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                authtoken: authtoken,
                id: worksiteId,
                worksitetype: worksiteType
            })
        });
        const data = await response.json();
        if (data.success) {
            alert("🎉 系统接口与参数配置保存成功！已同步至服务端及本地。");
        } else {
            alert("保存失败: " + (data.detail || "未知错误"));
        }
    } catch (err) {
        alert("保存请求出错: " + err.message);
    } finally {
        dom.saveConfigBtn.disabled = false;
    }
}

function handleAdminLogout() {
    if (confirm("确定要退出登录并清除当前设备的身份凭证吗？")) {
        appConfig.authtoken = "";
        localStorage.removeItem(CONFIG_KEY);
        window.location.href = "/";
    }
}

// Event Listeners setup
document.addEventListener("DOMContentLoaded", () => {
    initDom();
    initTheme();
    loadConfig();
    loadConfigFromServer();
    fetchLocalData();
    loadVolcConfig();
    loadPublicApiConfig();
    loadPendingList();
    setupUploadEvents();
    loadQrConfig();
    initWaybillDates();

    // Key configuration
    safeAddListener(dom.adminLogoutBtn, "click", handleAdminLogout);
    safeAddListener(dom.saveVolcConfigBtn, "click", saveVolcConfig);
    safeAddListener(dom.savePublicApiConfigBtn, "click", savePublicApiConfig);
    safeAddListener(dom.generateApiKeyBtn, "click", generateApiKey);
    safeAddListener(dom.copyPublicApiUrlBtn, "click", copyPublicApiUrl);
    if (dom.publicApiEnabledCheckbox) {
        dom.publicApiEnabledCheckbox.addEventListener("change", updatePublicApiUrlDisplay);
    }
    if (dom.publicApiKeyInput) {
        dom.publicApiKeyInput.addEventListener("input", updatePublicApiUrlDisplay);
    }
    safeAddListener(dom.refreshPendingBtn, "click", loadPendingList);
    safeAddListener(dom.themeToggleBtn, "click", toggleTheme);

    // Tab Navigation
    safeAddListener(dom.tabOcrBtn, "click", () => switchTab("ocr"));
    safeAddListener(dom.tabWaybillBtn, "click", () => switchTab("waybill"));
    safeAddListener(dom.tabAbsorptiveBtn, "click", () => switchTab("absorptive"));
    safeAddListener(dom.tabQrBtn, "click", () => switchTab("qr"));
    safeAddListener(dom.tabConfigBtn, "click", () => switchTab("config"));

    // Absorptive Capacity Analytics Listeners
    safeAddListener(dom.queryAbsorptiveStatsBtn, "click", queryAbsorptiveStats);
    safeAddListener(dom.queryMatrixStatsBtn, "click", queryAbsorptiveMatrixStats);
    safeAddListener(dom.saveQuotaBtn, "click", saveAbsorptiveQuota);
    safeAddListener(dom.viewModeTableBtn, "click", () => setAbsorptiveViewMode("table"));
    safeAddListener(dom.viewModeCardBtn, "click", () => setAbsorptiveViewMode("card"));
    safeAddListener(dom.absorptiveSelectName, "change", () => {
        if (cachedMatrixData) {
            const selectedSite = dom.absorptiveSelectName ? dom.absorptiveSelectName.value : "全部土点";
            const fullMatrix = cachedMatrixData.matrix || [];
            let filteredRows = fullMatrix;
            if (selectedSite && selectedSite !== "全部土点") {
                filteredRows = fullMatrix.filter(r => 
                    selectedSite.toLowerCase().includes(r.name.toLowerCase()) || 
                    r.name.toLowerCase().includes(selectedSite.toLowerCase())
                );
            }
            renderMatrixUI({ ...cachedMatrixData, matrix: filteredRows }, true);
        }
    });

    // Auto default view mode according to screen size
    if (window.innerWidth <= 768) {
        setAbsorptiveViewMode("card");
    } else {
        setAbsorptiveViewMode("table");
    }

    // System Config listeners
    safeAddListener(dom.saveConfigBtn, "click", saveConfig);
    safeAddListener(dom.refreshCaptchaBtn, "click", () => loadCaptcha());
    safeAddListener(dom.autoLoginBtn, "click", loginAndSaveToken);
    safeAddListener(dom.syncConfigFromServerBtn, "click", () => loadConfigFromServer(true));
    if (dom.captchaCodeInput) {
        dom.captchaCodeInput.addEventListener("keydown", event => {
            if (event.key === "Enter") loginAndSaveToken();
        });
    }

    // Waybills query
    safeAddListener(dom.toggleAdvancedFiltersBtn, "click", toggleAdvancedFilters);
    safeAddListener(dom.waybillQueryBtn, "click", queryWaybills);
    safeAddListener(dom.waybillResetBtn, "click", resetWaybillFilters);
    
    if (dom.waybillFilterCode) {
        dom.waybillFilterCode.addEventListener("keydown", event => {
            if (event.key === "Enter") queryWaybills();
        });
    }
    if (dom.waybillFilterWorksiteId) {
        dom.waybillFilterWorksiteId.addEventListener("keydown", event => {
            if (event.key === "Enter") queryWaybills();
        });
    }

    const pillsContainer = document.querySelector(".status-pills-container");
    if (pillsContainer) {
        pillsContainer.addEventListener("click", handleWaybillStatePillClick);
    }

    // QR Helper buttons
    safeAddListener(dom.batchAddBtn, "click", openBatchAddModal);
    safeAddListener(dom.resetAllVehiclesBtn, "click", handleResetAllVehicles);

    // Modals buttons
    safeAddListener(dom.closeQrCodeModalBtn, "click", closeAllModals);
    safeAddListener(dom.cancelQrCodeModalBtn, "click", closeAllModals);
    safeAddListener(dom.confirmQrScannedBtn, "click", processQrScannedConfirm);

    safeAddListener(dom.closeBatchAddModalBtn, "click", closeAllModals);
    safeAddListener(dom.cancelBatchAddModalBtn, "click", closeAllModals);
    safeAddListener(dom.confirmBatchAddBtn, "click", handleBatchAddSubmit);

    safeAddListener(dom.closeEditQrModalBtn, "click", closeAllModals);
    safeAddListener(dom.cancelEditQrModalBtn, "click", closeAllModals);
    safeAddListener(dom.saveEditQrBtn, "click", handleSaveEditQr);
    
    safeAddListener(dom.deleteVehicleBtn, "click", () => {
        if (activeQrVehiclePlate) {
            deleteQrVehicle(activeQrVehiclePlate);
            closeAllModals();
        }
    });

    if (dom.vehicleQrFileInput) {
        dom.vehicleQrFileInput.addEventListener("change", event => {
            const file = event.target.files[0];
            if (file) {
                compressImage(file, dataUrl => updateUploadPreview(dataUrl));
            }
        });
    }

    safeAddListener(dom.deleteVehicleQrBtn, "click", () => updateUploadPreview(null));

    // Escape key closes modals
    window.addEventListener("keydown", event => {
        if (event.key === "Escape") closeAllModals();
    });
});
