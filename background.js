// background.js

/**
 * @fileoverview Background script (Service Worker) for AI Resume Filler.
 * Handles communication, state, API calls, side panel, and handshake.
 * Implements readyTabs and tabsNeedingExtraction sets for robust state management.
 * Reverting response_format to 'text' for debugging empty content issue.
 */

// --- Constants ---
const DEEPSEEK_API_KEY = "sk-piyltlutjkfacflrqacsjoxfrzwfdnfmtotodjtylrxetgcb"; // 已填入你的 Key
const DEEPSEEK_API_ENDPOINT = "https://api.siliconflow.cn/v1/chat/completions";
const DEEPSEEK_MODEL = "deepseek-ai/DeepSeek-R1"; // 确认模型有效性

// --- Globals ---
let readyTabs = new Set();
let tabsNeedingExtraction = new Set();

// --- Helper Functions ---
function sendStatusUpdate(text, statusType) {
    console.log(`[Status Update] Sending to sidebar: [${statusType}] ${text}`);
    chrome.runtime.sendMessage({ action: "aiStatusUpdate", text: text, statusType: statusType })
        .catch(error => {
            if (error.message.includes("Receiving end does not exist")) { console.warn("Sidebar not open."); }
            else { console.error("Error sending status update:", error); }
        });
}

function getResumeStructureKeys(data) { /* ... 函数内容不变 ... */
    const structure = {}; if (typeof data !== 'object' || data === null) return structure;
    for (const key in data) { if (Object.hasOwnProperty.call(data, key)) { if (Array.isArray(data[key])) { structure[key] = data[key].length > 0 ? [getResumeStructureKeys(data[key][0])] : []; } else if (typeof data[key] === 'object' && data[key] !== null) { structure[key] = getResumeStructureKeys(data[key]); } else { structure[key] = ""; } } }
    return structure;
}

function triggerExtractForm(tabId) { /* ... 函数内容不变 ... */
    if (!tabsNeedingExtraction.has(tabId)) { console.warn(`[BG Trigger] Tab ${tabId} 不再需要提取，取消发送 extractForm。`); return; } if (!readyTabs.has(tabId)) { console.warn(`[BG Trigger] Tab ${tabId} 在尝试触发时已不再就绪，取消发送 extractForm。`); tabsNeedingExtraction.delete(tabId); return; }
    console.log(`[BG Trigger] 尝试为 tab ${tabId} 发送 extractForm...`); sendStatusUpdate("页面脚本已连接，正在分析页面结构...", "loading");
    chrome.tabs.sendMessage(tabId, { action: "extractForm" })
        .then(response => { console.log(`[BG Trigger] 收到 tab ${tabId} 对 extractForm 的即时响应:`, response); if (response && response.status === "success" && response.data) { handleFormExtractionResult(response.data, tabId); } else { console.error(`[BG Trigger] Tab ${tabId} 的表单提取失败或返回错误:`, response); sendStatusUpdate(`页面分析失败: ${response ? response.message || response.status : '未知错误'}`, "error"); tabsNeedingExtraction.delete(tabId); readyTabs.delete(tabId); } })
        .catch(error => { console.error(`[BG Trigger] 向 tab ${tabId} 发送 extractForm 消息失败:`, error.message); tabsNeedingExtraction.delete(tabId); readyTabs.delete(tabId); if (error.message.includes("Receiving end does not exist")) { sendStatusUpdate("与页面脚本连接中断或页面已关闭。", "error"); } else { sendStatusUpdate("发送页面分析请求时出错。", "error"); } });
}

function handleFormExtractionResult(extractedFields, sourceTabId) { /* ... 函数内容不变 ... */
     if (!tabsNeedingExtraction.has(sourceTabId)) { console.warn(`[BG Handler] Tab ${sourceTabId} 已不在需要提取列表，忽略提取结果。`); return; } if (!readyTabs.has(sourceTabId)) { console.warn(`[BG Handler] Tab ${sourceTabId} 在处理提取结果时已不再就绪。`); tabsNeedingExtraction.delete(sourceTabId); return; }
    console.log(`[BG Handler] 准备为 tab ${sourceTabId} 调用 API...`); chrome.storage.local.get('resumeData', (result) => { tabsNeedingExtraction.delete(sourceTabId); if (chrome.runtime.lastError) { console.error("Error getting resume data:", chrome.runtime.lastError); sendStatusUpdate("错误：无法读取本地简历数据。", "error"); readyTabs.delete(sourceTabId); return; } if (!result.resumeData || Object.keys(result.resumeData).length === 0) { console.warn("No resume data found."); sendStatusUpdate("错误：请先在侧边栏保存简历。", "error"); readyTabs.delete(sourceTabId); return; } callDeepSeekAPI(extractedFields, result.resumeData, sourceTabId) .catch((error) => { console.error("Unhandled error during API call:", error); sendStatusUpdate("处理 AI 请求时意外出错。", "error"); readyTabs.delete(sourceTabId); }); });
}

/**
 * 调用 SiliconFlow API 进行字段映射。
 */
async function callDeepSeekAPI(extractedFields, resumeData, tabId) {
     if (!readyTabs.has(tabId)) { console.warn(`[API Call] Tab ${tabId} 在 API 调用前已不再就绪，取消。`); return; }

    sendStatusUpdate("正在调用 AI 进行字段映射...", "loading");
    console.log(`[API Call] Calling SiliconFlow API for tab ${tabId}...`);
    const resumeStructure = getResumeStructureKeys(resumeData);
    console.log(`[API Call] Resume Structure for API (tab ${tabId}):`, JSON.stringify(resumeStructure, null, 2));

    const systemPrompt = `You are an expert AI assistant specialized in analyzing web form structures... (内容不变) ... Ensure the output is a single, valid JSON object and nothing else.`; // 提示语仍然要求 JSON 输出！
    const userPrompt = `Please perform the mapping based on the following data:\n\n1. Resume Data Structure (Keys only):\n\`\`\`json\n${JSON.stringify(resumeStructure, null, 2)}\n\`\`\`\n\n2. Web Form Structure (Fields extracted from the current web page):\n\`\`\`json\n${JSON.stringify(extractedFields, null, 2)}\n\`\`\`\n\nGenerate the JSON object containing the mapping (resume key path -> CSS selector). Remember to output ONLY the JSON object.`;

    // v--- 修改点：response_format 改回 text ---v
    const requestBody = {
        model: DEEPSEEK_MODEL,
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
        ],
        // temperature: 0.2, // 使用默认值
        max_tokens: 2048, // 保持或调整
        response_format: { type: "text" } // <--- 改回 "text"
    };
    // ^--- 修改结束 ---^

    try {
        console.log(`[API Call] Sending request to SiliconFlow (tab ${tabId}):`, JSON.stringify(requestBody, null, 2));
        const response = await fetch(DEEPSEEK_API_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${DEEPSEEK_API_KEY}` }, body: JSON.stringify(requestBody) });

        if (!response.ok) { /* ... 错误处理不变 ... */
            const errorBody = await response.text(); console.error(`[API Call] SiliconFlow API Error (tab ${tabId}): ${response.status} ${response.statusText}`, errorBody);
            let errorMessage = `AI API 请求失败: ${response.status} ${response.statusText}.`;
            try { const errorJson = JSON.parse(errorBody); if (errorJson && errorJson.message) errorMessage += ` (${errorJson.message})`; } catch (parseError) { errorMessage += ` (Raw response: ${errorBody})`; }
            sendStatusUpdate(errorMessage, "error"); readyTabs.delete(tabId); return;
         }

        const responseJson = await response.json();
        console.log(`[API Call] SiliconFlow API Response (tab ${tabId}):`, JSON.stringify(responseJson, null, 2));

        // v--- 修改检查和解析逻辑 ---v
        if (!responseJson.choices || responseJson.choices.length === 0 || !responseJson.choices[0].message || typeof responseJson.choices[0].message.content !== 'string') { // 允许空字符串，只检查结构和类型
            console.error(`[API Call] Invalid response structure or content type (tab ${tabId}):`, responseJson);
            sendStatusUpdate("AI 返回了无效的响应结构或内容类型。", "error"); // 更新错误信息
            readyTabs.delete(tabId); return;
        }

        const aiContent = responseJson.choices[0].message.content.trim();
        let mapping = null;

        console.log(`[API Call] Received content (expected text):`, aiContent); // 打印收到的文本

        if (aiContent === "") {
            console.warn(`[API Call] API returned empty content string (tab ${tabId}).`);
            sendStatusUpdate("AI 未能生成有效的映射结果 (返回空内容)。", "error"); // 明确是空内容错误
            readyTabs.delete(tabId); return;
        }

        // 尝试解析 JSON (即使请求的是 text，模型可能仍然返回 JSON 或 Markdown 包裹的 JSON)
        try {
            // 1. 尝试从 Markdown 代码块中提取
             const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/);
             if (jsonMatch && jsonMatch[1]) {
                 console.log("[API Call] Found JSON in markdown block, attempting parse...");
                 mapping = JSON.parse(jsonMatch[1]);
                 if (typeof mapping !== 'object' || mapping === null) throw new Error("Parsed markdown content not object.");
                 console.log(`[API Call] Parsed mapping from markdown (tab ${tabId}):`, mapping);
             } else {
                  // 2. 如果没有 Markdown，尝试直接解析整个内容
                  console.log("[API Call] No markdown block found, attempting direct parse...");
                  mapping = JSON.parse(aiContent);
                  if (typeof mapping !== 'object' || mapping === null) throw new Error("Direct parse result is not an object.");
                  console.log(`[API Call] Parsed AI mapping directly (tab ${tabId}):`, mapping);
             }
        } catch (e) {
            console.error(`[API Call] Failed to parse JSON from AI response (tab ${tabId}). Error: ${e.message}. Content:`, aiContent);
            sendStatusUpdate("AI 返回的映射格式无法解析。", "error");
            readyTabs.delete(tabId); return; // 解析失败，流程终止
        }
        // ^--- 响应处理修改结束 ---^

        // --- 后续发送填充指令的逻辑保持不变 ---
        if (!readyTabs.has(tabId)) { console.warn(`[API Call] Tab ${tabId} 在 API 成功后不再就绪，取消填充。`); return; }
        sendStatusUpdate("AI 映射完成，正在填充表单...", "loading");
        chrome.tabs.sendMessage(tabId, { action: "fillForm", mapping: mapping, resumeData: resumeData })
            .catch(error => { console.error(`[API Call] Error sending fillForm message (tab ${tabId}):`, error.message); sendStatusUpdate("无法向页面发送填充指令。", "error"); readyTabs.delete(tabId); });

    } catch (error) { console.error(`[API Call] Network/fetch error (tab ${tabId}):`, error); sendStatusUpdate(`调用 AI 时网络错误: ${error.message}`, "error"); readyTabs.delete(tabId); }
}

// --- Event Listeners (onInstalled, onMessage, onRemoved, onUpdated) ---
chrome.runtime.onInstalled.addListener(() => { /* ... 安装逻辑不变 ... */ console.log("AI Resume Filler: Extension installed or updated."); chrome.sidePanel.setOptions({ path: 'sidebar/sidebar.html', enabled: true }).catch(error => console.error("Error setting sidePanel options:", error)); if (chrome.sidePanel.setPanelBehavior) { chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).then(() => console.log("Side panel behavior set.")).catch(error => console.error("Error setting panel behavior:", error)); } else { console.warn("setPanelBehavior API not available."); } chrome.storage.local.get('resumeData', (result) => { if (chrome.runtime.lastError) { console.error("Error getting initial resumeData:", chrome.runtime.lastError); return; } if (!result.resumeData) { console.log("Initializing empty resume data."); const emptyResume = { personalInfo:{}, contactInfo:{address:{}}, education:[], workExperience:[], projectExperience:[], skills:[], certifications:[], awardsAndHonors:[], languages:[], expectedJob:{expectedLocation:[], expectedIndustry:[]}, selfEvaluation:"", references:[], additionalInfo:"", attachments:{photo:{},resume:{},coverLetter:{},otherAttachments:[]} }; chrome.storage.local.set({ resumeData: emptyResume }, () => { if (chrome.runtime.lastError) { console.error("Error initializing resumeData:", chrome.runtime.lastError); } }); } }); });
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => { /* ... 监听器主体逻辑不变 ... */ console.log("收到消息:", message, "来自:", sender); if (message.action === "startAIFill") { console.log("[BG Listener] 处理 startAIFill 请求..."); try { chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => { if (chrome.runtime.lastError) { console.error("[BG Listener] 查询标签页出错:", chrome.runtime.lastError.message); sendStatusUpdate(`错误：无法获取活动标签页信息 (${chrome.runtime.lastError.message})`, "error"); return; } if (!tabs || tabs.length === 0) { console.error("[BG Listener] 未找到活动标签页。"); sendStatusUpdate("错误：找不到活动标签页。", "error"); return; } const tab = tabs[0]; const currentTabId = tab.id; if (!tab.url || !tab.url.startsWith('http')) { console.warn(`[BG Listener] URL 检查失败: ${tab.url}`); sendStatusUpdate("错误：无法在此页面上运行插件。", "error"); return; } console.log(`[BG Listener] 请求处理 tab ${currentTabId} (${tab.url})。`); if (readyTabs.has(currentTabId)) { console.log(`[BG Listener] Tab ${currentTabId} 已就绪，标记为需要提取并直接触发。`); tabsNeedingExtraction.add(currentTabId); triggerExtractForm(currentTabId); } else { console.log(`[BG Listener] Tab ${currentTabId} 尚未就绪，标记为需要提取并尝试发送 Ping。`); tabsNeedingExtraction.add(currentTabId); sendStatusUpdate("正在连接页面脚本...", "loading"); console.log(`[BG Listener] 向 tab ${currentTabId} 发送 ping...`); chrome.tabs.sendMessage(currentTabId, { action: "ping" }).then(response => { if (response && response.status === "pong") { console.log(`[BG Listener]收到来自 tab ${currentTabId} 的 pong 响应，标记为就绪并触发提取。`); readyTabs.add(currentTabId); if (tabsNeedingExtraction.has(currentTabId)) { triggerExtractForm(currentTabId); } } else { console.warn(`[BG Listener] 收到来自 tab ${currentTabId} 的 ping 响应，但内容不是 pong:`, response); } }).catch(error => { console.warn(`[BG Listener]向 tab ${currentTabId} 发送 ping 失败 (可能未就绪):`, error.message); }); } }); } catch (e) { console.error("[BG Listener] 调用 tabs.query 时同步出错:", e); sendStatusUpdate(`内部错误：查询标签页时出错 (${e.message})`, "error"); } return true; } else if (message.action === "contentScriptReady") { if (sender.tab && sender.tab.id) { const readyTabId = sender.tab.id; console.log(`[BG Listener] 收到来自 tab ${readyTabId} 的 contentScriptReady 消息。`); readyTabs.add(readyTabId); if (tabsNeedingExtraction.has(readyTabId)) { console.log(`[BG Listener] Tab ${readyTabId} 在待处理列表中，触发 extractForm...`); triggerExtractForm(readyTabId); } else { console.log(`[BG Listener] Tab ${readyTabId} 不在待处理列表中，仅记录其就绪状态。`); } if (sendResponse) { try { sendResponse({ status: "readyReceived" }); } catch (e) { console.warn("回复 contentScriptReady 时出错:", e.message); } } } else { console.warn("[BG Listener] 收到 contentScriptReady 但缺少 sender tab 信息。"); } return true; } else if (message.action === "fillingComplete") { if (!sender.tab || !sender.tab.id) { console.warn("Received fillingComplete without sender tab info."); return; } const sourceTabId = sender.tab.id; console.log(`[BG Listener] 收到来自 tab ${sourceTabId} 的 fillingComplete 状态:`, message); tabsNeedingExtraction.delete(sourceTabId); readyTabs.delete(sourceTabId); if (message.success) { if (message.failed > 0 || message.skipped > 0) { sendStatusUpdate(`部分字段填充完成 (成功: ${message.filled}, 失败: ${message.failed}, 跳过: ${message.skipped})。请检查！`, "success"); } else { sendStatusUpdate(`所有识别字段填充完成 (共 ${message.filled} 个)。请仔细检查！`, "success"); } } else { if (message.filled > 0) { sendStatusUpdate(`尝试填充失败 (成功: ${message.filled}, 失败: ${message.failed}, 跳过: ${message.skipped})。`, "error"); } else { sendStatusUpdate(`填充失败，未能匹配或填充任何字段。`, "error"); } } return; } else { console.log("[BG Listener] 收到未知消息或同步处理完成:", message); return false; } });
chrome.tabs.onRemoved.addListener((tabId, removeInfo) => { console.log(`[BG Cleanup] Tab ${tabId} 已关闭，清理状态。`); tabsNeedingExtraction.delete(tabId); readyTabs.delete(tabId); });
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => { if (changeInfo.status === 'loading' || changeInfo.url) { if (tabsNeedingExtraction.has(tabId) || readyTabs.has(tabId)) { console.log(`[BG Cleanup] Tab ${tabId} 更新/导航，清理状态。`); tabsNeedingExtraction.delete(tabId); readyTabs.delete(tabId); } } });

console.log("AI Resume Filler: Background script loaded and running.");