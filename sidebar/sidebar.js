// sidebar/sidebar.js

/**
 * @fileoverview Sidebar logic for the AI Resume Filler extension.
 * Handles loading/saving resume data to local storage, dynamic form updates,
 * and communication with the background script for AI filling.
 */

// --- DOM Elements ---
// 使用 const 定义常量，存储对常用 DOM 元素的引用
const resumeForm = document.getElementById('resumeForm'); // 整个表单
const saveButton = document.getElementById('saveResume'); // 保存按钮
const aiFillButton = document.getElementById('aiFillForm'); // AI 填充按钮
const statusMessageDiv = document.getElementById('statusMessage'); // 状态消息显示区域

// 数组容器的 ID 映射，方便管理
const arrayContainers = {
    education: document.getElementById('educationContainer'),
    workExperience: document.getElementById('workExperienceContainer'),
    projectExperience: document.getElementById('projectExperienceContainer'),
    skills: document.getElementById('skillsContainer'),
    certifications: document.getElementById('certificationsContainer'),
    awardsAndHonors: document.getElementById('awardsAndHonorsContainer'),
    languages: document.getElementById('languagesContainer')
    // 注意：references 和 otherAttachments 的动态添加未在此实现，可按需扩展
};

// 模板 ID 映射
const arrayTemplates = {
    education: 'educationTemplate',
    workExperience: 'workExperienceTemplate',
    projectExperience: 'projectExperienceTemplate',
    skills: 'skillsTemplate',
    certifications: 'certificationsTemplate',
    awardsAndHonors: 'awardsAndHonorsTemplate',
    languages: 'languagesTemplate'
};

// --- Utility Functions ---

/**
 * 根据点号分隔的字符串路径设置对象嵌套属性的值
 * @param {object} obj - 目标对象
 * @param {string} path - 属性路径 (e.g., "contactInfo.address.city")
 * @param {*} value - 要设置的值
 */
function setPropertyByString(obj, path, value) {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        // 如果路径中的某个键不存在或不是对象，则创建它
        if (!current[key] || typeof current[key] !== 'object') {
            current[key] = {};
        }
        current = current[key];
    }
    current[keys[keys.length - 1]] = value;
}

/**
 * 根据 ID 获取表单元素的值，处理不同类型的输入
 * @param {string} id - 元素的 ID
 * @returns {*} 元素的值 (string, boolean, etc.)
 */
function getElementValue(id) {
    const element = document.getElementById(id);
    if (!element) return undefined; // 元素不存在则返回 undefined

    switch (element.type) {
        case 'checkbox':
            return element.checked; // 复选框返回布尔值
        case 'select-multiple':
            // 处理多选下拉框（本例中未使用，但可备用）
            return Array.from(element.selectedOptions).map(option => option.value);
        default:
            return element.value; // 其他类型返回 value 属性值
    }
}

/**
 * 根据 ID 设置表单元素的值，处理不同类型的输入
 * @param {string} id - 元素的 ID
 * @param {*} value - 要设置的值
 */
function setElementValue(id, value) {
    const element = document.getElementById(id);
    if (!element) return; // 元素不存在则跳过

    switch (element.type) {
        case 'checkbox':
            element.checked = !!value; // 将值转换为布尔值设置 checked 状态
            break;
        case 'select-one': // 单选下拉框
        case 'select-multiple':
            // 尝试精确匹配 value，如果不行则尝试部分匹配文本内容（对 select 可能有用）
            const options = Array.from(element.options);
            let found = false;
            if (value !== undefined && value !== null) {
                element.value = value; // 优先尝试直接设置 value
                if (element.value === String(value)) { // 检查是否设置成功
                   found = true;
                }
            }
             // 如果值为空或直接设置失败，确保选中空选项（如果存在）
            if (!found && (value === undefined || value === null || value === '')) {
                 const emptyOption = options.find(opt => opt.value === '');
                 if (emptyOption) element.value = '';
            }
            break;
        default:
             // 对于 null 或 undefined，设置为空字符串
            element.value = (value === null || value === undefined) ? '' : value;
            break;
    }
}

/**
 * 显示状态消息
 * @param {string} message - 要显示的消息文本
 * @param {'success' | 'error' | 'loading' | ''} type - 消息类型，用于 CSS 样式
 * @param {number} [duration=3000] - 消息显示时长（毫秒），0 表示一直显示，默认 3 秒
 */
function showStatusMessage(message, type, duration = 3000) {
    statusMessageDiv.textContent = message;
    // 移除所有可能的旧类型 class
    statusMessageDiv.classList.remove('success', 'error', 'loading');
    if (type) {
        statusMessageDiv.classList.add(type); // 添加新类型 class
    }
    statusMessageDiv.style.display = message ? 'block' : 'none'; // 控制显示/隐藏

    // 如果设置了时长，在时长过后自动隐藏消息 (仅对 success 和 error 类型)
    if (duration > 0 && (type === 'success' || type === 'error')) {
        setTimeout(() => {
            // 检查当前消息是否还是这个，避免隐藏后续的其他消息
            if (statusMessageDiv.textContent === message) {
                statusMessageDiv.style.display = 'none';
                statusMessageDiv.textContent = '';
                statusMessageDiv.classList.remove(type);
            }
        }, duration);
    }
}

// --- Array Item Handling ---

/**
 * 向指定的数组容器中添加一个新的条目
 * @param {string} containerKey - 数组容器的键名 (e.g., "education")
 * @param {object | null} itemData - (可选) 用于填充新条目的数据对象
 */
function addArrayItem(containerKey, itemData = null) {
    const container = arrayContainers[containerKey];
    const templateId = arrayTemplates[containerKey];
    const template = document.getElementById(templateId);

    if (!container || !template) {
        console.error(`Container or template not found for key: ${containerKey}`);
        return;
    }

    // 克隆模板内容
    const clone = template.content.cloneNode(true);
    const newItemDiv = clone.querySelector('.array-item'); // 获取克隆出的最外层 div

    // 如果有数据，填充表单字段
    if (itemData && typeof itemData === 'object') {
        // 查找克隆内容中的所有 input, select, textarea 元素
        const inputs = newItemDiv.querySelectorAll('input, select, textarea');
        inputs.forEach(input => {
            const name = input.name; // 使用 name 属性来匹配 itemData 的键
            if (name && itemData.hasOwnProperty(name)) {
                let value = itemData[name];
                 // 特殊处理：将数组类型的字段（如 relevantCourses, technologiesUsed）转为逗号分隔字符串
                if (Array.isArray(value)) {
                    value = value.join(', '); // 用逗号和空格连接
                }
                // 设置元素值
                setElementValueInScope(input, value);
            }
        });
    }

    // 为移除按钮添加事件监听器
    const removeButton = newItemDiv.querySelector('.remove-item-btn');
    if (removeButton) {
        removeButton.addEventListener('click', () => {
            newItemDiv.remove(); // 点击时移除整个条目 div
        });
    }

    // 将克隆的条目添加到容器中
    container.appendChild(newItemDiv);
}

/**
 * 在特定作用域（如数组项内部）内设置元素的值
 * @param {HTMLElement} element - 目标元素
 * @param {*} value - 要设置的值
 */
function setElementValueInScope(element, value) {
     switch (element.type) {
        case 'checkbox':
            element.checked = !!value;
            break;
        // Add other types if needed (like select), similar to setElementValue
        default:
             // 将数组转为逗号分隔字符串显示
             if (Array.isArray(value)) {
                element.value = value.join(', ');
            } else {
                element.value = (value === null || value === undefined) ? '' : value;
            }
            break;
    }
}


// --- Data Handling ---

/**
 * 从本地存储加载简历数据并填充表单
 */
async function loadResumeData() {
    console.log("Attempting to load resume data..."); // 调试信息
    showStatusMessage("正在加载简历...", "loading", 0);
    try {
        // 从 chrome.storage.local 获取名为 'resumeData' 的数据
        const result = await chrome.storage.local.get('resumeData');
        if (result.resumeData) {
            console.log("Resume data found:", result.resumeData); // 调试信息
            populateForm(result.resumeData); // 使用获取到的数据填充表单
            showStatusMessage("简历加载成功!", "success");
        } else {
            console.log("No resume data found in storage."); // 调试信息
            // 可选：如果没数据，可以清空表单或加载默认空结构
            // populateForm(createEmptyResume()); // 假设有 createEmptyResume 函数
            showStatusMessage("未找到已存简历，请填写。", "");
        }
    } catch (error) {
        console.error('Error loading resume data:', error);
        showStatusMessage(`加载简历失败: ${error.message}`, "error", 5000);
    }
}

/**
 * 使用给定的数据对象填充整个表单
 * @param {object} data - 包含简历数据的对象
 */
function populateForm(data) {
    console.log("Populating form with data:", data); // 调试信息
    // 1. 填充简单字段和嵌套对象字段
    const inputs = resumeForm.querySelectorAll('input[id], select[id], textarea[id]');
    inputs.forEach(input => {
        const id = input.id;
        // 尝试从数据对象中获取对应的值 (需要处理点号路径)
        try {
            const value = id.split('.').reduce((obj, key) => (obj && obj[key] !== 'undefined') ? obj[key] : undefined, data);
             if (value !== undefined) {
                console.log(`Setting value for ${id}:`, value); // 调试信息
                setElementValue(id, value);
            } else {
                 console.log(`No value found for ${id}, clearing field.`); // 调试信息
                 setElementValue(id, ''); // 如果数据中没找到对应值，清空字段
            }
        } catch (e) {
            // 忽略获取属性时的错误 (比如路径中间某部分不存在)
             console.warn(`Could not retrieve value for ${id}, clearing field.`);
             setElementValue(id, '');
        }
    });

    // 2. 清空并填充数组字段
    for (const key in arrayContainers) {
        const container = arrayContainers[key];
        // 先清空容器内所有旧的 .array-item
        container.innerHTML = '';
        // 如果数据中有这个数组并且数组不为空
        if (data[key] && Array.isArray(data[key]) && data[key].length > 0) {
            console.log(`Populating array section: ${key}`); // 调试信息
            // 遍历数据中的每个条目，调用 addArrayItem 添加并填充
            data[key].forEach(itemData => {
                addArrayItem(key, itemData);
            });
        }
    }
     console.log("Form population complete."); // 调试信息
}


/**
 * 从表单收集数据并构造成简历对象
 * @returns {object} 包含当前表单数据的简历对象
 */
function collectFormData() {
    const resumeData = {};

    // 1. 收集简单字段和嵌套对象字段
    const inputs = resumeForm.querySelectorAll('input[id], select[id], textarea[id]');
    inputs.forEach(input => {
        const id = input.id;
        const value = getElementValue(id);
        // 使用 setPropertyByString 将值设置到 resumeData 对象的正确路径下
        setPropertyByString(resumeData, id, value);
    });

    // 2. 收集数组字段
    for (const key in arrayContainers) {
        const container = arrayContainers[key];
        const items = []; // 用于存储当前数组的所有条目数据
        // 查找容器内所有的 .array-item 元素
        container.querySelectorAll('.array-item').forEach(itemDiv => {
            const itemData = {}; // 当前条目的数据对象
            // 查找该条目下的所有 input, select, textarea
            itemDiv.querySelectorAll('input, select, textarea').forEach(input => {
                const name = input.name; // 使用 name 属性作为键
                if (name) {
                    let value = input.type === 'checkbox' ? input.checked : input.value;

                    // 特殊处理：将逗号分隔的字符串转回数组 (针对 relevantCourses, technologiesUsed 等)
                    // 注意：这只是一个简单的实现，可能需要根据实际输入情况调整
                    if (name === 'relevantCourses' || name === 'technologiesUsed' || name === 'expectedLocation' || name === 'expectedIndustry') {
                         // 按逗号分割，并去除每个元素的头尾空格，过滤掉空字符串
                        value = value.split(',')
                                     .map(s => s.trim())
                                     .filter(s => s !== '');
                    }
                     // 如果是数字类型的 input，尝试转换为数字
                    if (input.type === 'number' && value !== '') {
                        const num = parseFloat(value);
                        if (!isNaN(num)) {
                            value = num;
                        }
                    }

                    itemData[name] = value;
                }
            });
            // 只有当条目包含有效数据时才添加到数组 (可选，避免空对象)
            // if (Object.keys(itemData).length > 0) {
                 items.push(itemData);
            // }
        });
        // 将收集到的数组数据赋值给 resumeData 的对应键
        resumeData[key] = items;
    }

     // 特殊处理顶层的 expectedLocation 和 expectedIndustry (在 HTML 中是逗号分隔的字符串)
     if (resumeData.expectedJob && resumeData.expectedJob.expectedLocation && typeof resumeData.expectedJob.expectedLocation === 'string') {
         resumeData.expectedJob.expectedLocation = resumeData.expectedJob.expectedLocation.split(',').map(s => s.trim()).filter(s => s !== '');
     } else if (resumeData.expectedJob && !resumeData.expectedJob.expectedLocation) {
         resumeData.expectedJob.expectedLocation = []; // 确保是数组
     }
      if (resumeData.expectedJob && resumeData.expectedJob.expectedIndustry && typeof resumeData.expectedJob.expectedIndustry === 'string') {
         resumeData.expectedJob.expectedIndustry = resumeData.expectedJob.expectedIndustry.split(',').map(s => s.trim()).filter(s => s !== '');
     } else if (resumeData.expectedJob && !resumeData.expectedJob.expectedIndustry) {
         resumeData.expectedJob.expectedIndustry = []; // 确保是数组
     }


    console.log("Collected form data:", resumeData); // 调试信息
    return resumeData;
}

/**
 * 保存当前表单数据到本地存储
 */
async function saveResumeData() {
    showStatusMessage("正在保存...", "loading", 0);
    try {
        const dataToSave = collectFormData(); // 从表单收集数据
        // 使用 chrome.storage.local.set 保存数据
        await chrome.storage.local.set({ resumeData: dataToSave });
        console.log('Resume data saved successfully.'); // 调试信息
        showStatusMessage("简历保存成功!", "success");
    } catch (error) {
        console.error('Error saving resume data:', error);
        showStatusMessage(`保存失败: ${error.message}`, "error", 5000);
    }
}

// --- Event Listeners ---

/**
 * 初始化函数，在 DOM 加载完成后执行
 */
function initialize() {
    // 1. 加载已保存的简历数据
    loadResumeData();

    // 2. 为保存按钮添加点击事件监听器
    saveButton.addEventListener('click', saveResumeData);

    // 3. 为 AI 填充按钮添加点击事件监听器
    aiFillButton.addEventListener('click', () => {
        console.log("AI Fill button clicked."); // 调试信息
        showStatusMessage("正在准备填充...", "loading", 0);
        // 禁用按钮防止重复点击
        aiFillButton.disabled = true;
        aiFillButton.style.opacity = '0.7'; // 视觉反馈

        // 向 background script 发送消息，请求开始 AI 填充流程
        chrome.runtime.sendMessage({ action: "startAIFill" }, (response) => {
            // 这个回调是 sendMessage 的可选回调，用于接收 background script 的即时回复
            // 注意：核心状态更新将通过 background script 主动发送消息回来处理
            if (chrome.runtime.lastError) {
                console.error("Error sending startAIFill message:", chrome.runtime.lastError.message);
                showStatusMessage(`启动填充失败: ${chrome.runtime.lastError.message}`, "error", 5000);
                // 出错时恢复按钮状态
                aiFillButton.disabled = false;
                aiFillButton.style.opacity = '1';
            } else {
                console.log("Message sent to background script. Response:", response);
                // 根据 background 的即时回复做一些处理（如果需要）
                // 比如，如果 background 说它收到了请求，可以更新状态
                if (response && response.status === "received") {
                     showStatusMessage("已通知后台，正在分析页面...", "loading", 0);
                }
            }
        });
    });

    // 4. 为所有 "添加" 按钮添加事件监听器
    document.querySelectorAll('.add-item-btn').forEach(button => {
        button.addEventListener('click', (event) => {
            const targetButton = event.currentTarget; // 获取被点击的按钮
            const containerKey = targetButton.dataset.container.replace('Container', ''); // 从 data-container 获取 key
            addArrayItem(containerKey); // 调用添加函数
        });
    });

    // 5. 监听来自 background script 的消息 (用于状态更新)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log("Message received in sidebar:", message); // 调试信息
        if (message.action === "aiStatusUpdate") {
            // 更新状态消息
            showStatusMessage(message.text, message.statusType, 0); // 状态消息持续显示，直到下一次更新

            // 如果状态是成功或失败，恢复 AI 填充按钮
            if (message.statusType === 'success' || message.statusType === 'error') {
                aiFillButton.disabled = false;
                aiFillButton.style.opacity = '1';
                 // 对于成功消息，短暂显示后清除
                if(message.statusType === 'success'){
                    showStatusMessage(message.text, message.statusType, 3000);
                } else {
                     showStatusMessage(message.text, message.statusType, 5000); // 错误消息显示长一点
                }
            }
        }
        // 可以选择性地返回 true 表示你会异步地发送响应 (sendResponse)，但在这个监听器中我们主要接收消息
        // return true;
    });

     console.log("Sidebar initialization complete."); // 调试信息
}

// --- Initialization ---
// 确保在 DOM 完全加载后再执行初始化脚本
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
} else {
    // DOMContentLoaded 已经发生
    initialize();
}

// --- Notes ---
// - ID Naming: Using dots in IDs (e.g., "personalInfo.name") is not strictly valid HTML,
//   but modern browsers handle it well, and it simplifies mapping logic here.
//   A more robust approach might use data attributes or valid IDs (e.g., "personalInfo-name")
//   and more complex mapping logic.
// - Array to String Conversion: The simple `.join(', ')` for array fields like
//   'relevantCourses' assumes user input or saved data is comma-separated.
//   Robust parsing might be needed if users input data differently.
// - Error Handling: Basic error handling is included, but could be expanded.
// - Completeness: This script covers the core logic described. Features like
//   handling 'references', 'otherAttachments', or more complex field types
//   (like file inputs - which are tricky in extensions) are not implemented.