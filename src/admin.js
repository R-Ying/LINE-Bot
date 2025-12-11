/* global Chart, bootstrap */

let isSubmitting = false;
let likesChart = null;
let usersChart = null;
let pageViewsChart = null;

document.addEventListener("DOMContentLoaded", function () {
    loadDashboardData();
    loadActiveCases();
    document.getElementById('completed-cases-tab').addEventListener('click', loadCompletedCases);
    document.getElementById('repairForm').addEventListener('submit', handleRepairFormSubmit);
    document.getElementById('uploadPhotoForm').addEventListener('submit', handleUploadPhotoSubmit);
    document.getElementById('data-table-body').addEventListener('change', handleStatusChange);
});

async function loadDashboardData() {
    console.log("Starting to load dashboard data");
    try {
        const response = await fetch("/api/dashboard-data");
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log("Dashboard data received:", data);

        document.getElementById('total-likes').textContent = data.totalLikes || 0;
        document.getElementById('page-views').textContent = data.totalPageViews || 0;
        document.getElementById('unique-users').textContent = data.totalUniqueUsers || 0;

        if (data.likesData && data.likesData.length > 0) {
            createLikesChart(data.likesData);
        } else {
            console.warn("No likes data available for chart");
        }

        if (data.dailyUsersData && data.dailyUsersData.length > 0) {
            createUsersChart(data.dailyUsersData);
        } else {
            console.warn("No daily users data available for chart");
        }

        if (data.dailyPageViewsData && data.dailyPageViewsData.length > 0) {
            createPageViewsChart(data.dailyPageViewsData);
        } else {
            console.warn("No daily page views data available for chart");
        }

    } catch (error) {
        console.error("Error loading dashboard data:", error);
        document.getElementById('total-likes').textContent = "加載失敗";
        document.getElementById('page-views').textContent = "加載失敗";
        document.getElementById('unique-users').textContent = "加載失敗";
    }
}

function createLikesChart(likesData) {
    console.log("Creating likes chart with data:", likesData);
    const ctx = document.getElementById('likesChart');
    
    if (likesChart) {
        likesChart.destroy();
    }
    
    if (!likesData || likesData.length === 0) {
        console.warn("No likes data available for chart");
        return;
    }
    
    likesChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: likesData.map(d => d.category),
            datasets: [{
                label: '點讚數',
                data: likesData.map(d => d.likes),
                backgroundColor: 'rgba(75, 192, 192, 0.6)',
                borderColor: 'rgba(75, 192, 192, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: '各類別點讚數'
                }
            }
        }
    });
}

function createUsersChart(usersData) {
    console.log("Creating users chart with data:", usersData);
    const ctx = document.getElementById('usersChart');
    
    if (usersChart) {
        usersChart.destroy();
    }
    
    usersChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: '每日使用者數',
                data: usersData.map(d => ({ x: d.date, y: d.count })),
                borderColor: 'rgba(75, 192, 192, 1)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day'
                    },
                    title: {
                        display: true,
                        text: '日期'
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '使用者數'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: '使用者數趨勢'
                }
            }
        }
    });
}

function createPageViewsChart(pageViewsData) {
    console.log("Creating page views chart with data:", pageViewsData);
    const ctx = document.getElementById('pageViewsChart');
    
    if (pageViewsChart) {
        pageViewsChart.destroy();
    }
    
    pageViewsChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: [{
                label: '每日頁面瀏覽數',
                data: pageViewsData.map(d => ({ x: d.date, y: d.views })),
                borderColor: 'rgba(255, 99, 132, 1)',
                backgroundColor: 'rgba(255, 99, 132, 0.2)',
                tension: 0.1
            }]
        },
        options: {
            responsive: true,
            scales: {
                x: {
                    type: 'time',
                    time: {
                        unit: 'day'
                    },
                    title: {
                        display: true,
                        text: '日期'
                    }
                },
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '頁面瀏覽數'
                    }
                }
            },
            plugins: {
                title: {
                    display: true,
                    text: '頁面瀏覽量趨勢'
                }
            }
        }
    });
}

async function handleUploadPhotoSubmit(event) {
    event.preventDefault();

    if (isSubmitting) {
        console.log('A submission is already in progress');
        alert('上傳正在進行中，請稍候...');
        return;
    }
    isSubmitting = true;

    const submitButton = document.querySelector('#uploadPhotoForm button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = '上傳中...';

    const formData = new FormData();
    formData.append('image', document.getElementById('photoFile').files[0]);
    formData.append('caseId', document.getElementById('uploadPhotoCaseId').value);
    formData.append('description', document.getElementById('photoDescription').value); // 添加照片描述

    try {
        const response = await fetch("/api/upload-case-photo", {
            method: "POST",
            body: formData
        });

        const result = await response.json();

        if (response.ok) {
            if (result.imageUrl) {
                alert("照片上傳成功");
                location.reload();
            } else {
                alert(result.message || "上傳成功，但沒有返回圖片URL");
            }
        } else {
            alert(result.message || "上傳失敗");
        }
    } catch (error) {
        console.error("上傳照片失敗：", error);
        alert("上傳照片失敗：" + error.message);
    } finally {
        isSubmitting = false;
        submitButton.disabled = false;
        submitButton.textContent = '上傳';
    }
}

function uploadPhotoModal(caseId) {
    document.getElementById('uploadPhotoCaseId').value = caseId;
    const uploadModal = new bootstrap.Modal(document.getElementById('uploadPhotoModal'));
    uploadModal.show();
    
    // 重置表單和狀態
    document.getElementById('uploadPhotoForm').reset();
    isSubmitting = false;
    const submitButton = document.querySelector('#uploadPhotoForm button[type="submit"]');
    submitButton.disabled = false;
    submitButton.textContent = '上傳';
}

document.getElementById('repairModal').addEventListener('hide.bs.modal', function () {
    if (!formSubmitted) {
        const caseId = document.getElementById('caseId').value;
        fetch(`/api/revert-case-status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caseId, status: '未處理' })
        })
        .then(response => response.json())
        .then(() => {
            console.log('案件狀態已恢復為未處理');
            updateDropdown(caseId, '未處理');
        })
        .catch(error => console.error('恢復案件狀態時出錯:', error));
    }
    formSubmitted = false;
});

let formSubmitted = false;

document.getElementById('repairForm').addEventListener('submit', function () {
    formSubmitted = true;
});

async function loadActiveCases() {
    try {
        const response = await fetch("/api/get-user-data");
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const tbody = document.getElementById("data-table-body");
        tbody.innerHTML = "";

        if (data && Object.keys(data).length > 0) {
            let index = 1;
            for (const caseId in data) {
                const caseInfo = data[caseId];
                if (caseInfo.status !== "已處理") {
                    const tr = createCaseRow(index++, caseId, caseInfo);
                    tbody.appendChild(tr);
                }
            }
            addEventListenersToActiveCases();
        } else {
            tbody.innerHTML = "<tr><td colspan='12'>沒有進行中的案件</td></tr>";
        }
    } catch (error) {
        console.error("Error fetching active cases:", error);
        document.getElementById("data-table-body").innerHTML = "<tr><td colspan='12'>加載數據時出錯</td></tr>";
    }
}

function createCaseRow(index, caseId, caseInfo) {
    const shortenedUserId = caseInfo.userId ? caseInfo.userId.substring(0, 6) : '';

    const formattedLatitude = caseInfo.latitude ? parseFloat(caseInfo.latitude).toFixed(6) : '';
    const formattedLongitude = caseInfo.longitude ? parseFloat(caseInfo.longitude).toFixed(6) : '';

    const tr = document.createElement("tr");
    tr.innerHTML = `
        <td>${index}</td>
        <td>${shortenedUserId}</td>
        <td>${caseInfo.category}</td>
        <td>${caseInfo.subcategory}</td>
        <td>${caseInfo.detailOption}</td>
        <td>${caseInfo.extraDetails || ''}</td>
        <td><a href="${caseInfo.imageUrl}" target="_blank">查看圖片</a></td>
        <td>${formattedLatitude}</td>
        <td>${formattedLongitude}</td>
        <td>${new Date(caseInfo.uploadTime).toLocaleString()}</td>
        <td>
            <select class="form-control" data-case-id="${caseId}">
                <option value="未處理" ${caseInfo.status === "未處理" ? "selected" : ""}>未處理</option>
                <option value="處理中" ${caseInfo.status === "處理中" ? "selected" : ""}>處理中</option>
                <option value="已處理" ${caseInfo.status === "已處理" ? "selected" : ""}>已處理</option>
            </select>
        </td>
        <td>
            <button class="btn btn-primary" data-case-id="${caseId}">上傳照片</button>
            <button class="btn btn-danger" data-case-id="${caseId}">刪除</button>
        </td>
    `;
    return tr;
}

function loadCompletedCases() {
    console.log("Starting to load completed cases...");
    fetch("/api/get-completed-cases")
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log("Completed cases data received:", data);
            const tbody = document.getElementById("completed-table-body");
            tbody.innerHTML = "";

            if (data && data.length > 0) {
                data.forEach((caseInfo, index) => {
                    const repairTimeDiff = calculateTimeDifference(caseInfo.reportTime, caseInfo.responseTime);

                    const formattedLatitude = caseInfo.latitude ? parseFloat(caseInfo.latitude).toFixed(6) : '';
                    const formattedLongitude = caseInfo.longitude ? parseFloat(caseInfo.longitude).toFixed(6) : '';

                    const tr = document.createElement("tr");
                    tr.innerHTML = `
                        <td>${index + 1}</td>
                        <td>${caseInfo.category || ''}</td>
                        <td>${caseInfo.subcategory || ''}</td>
                        <td>${caseInfo.detailOption || ''}</td>
                        <td>${caseInfo.extraDetails || ''}</td>
                        <td>${caseInfo.imageUrl ? `<a href="${caseInfo.imageUrl}" target="_blank">查看圖片</a>` : '無'}</td>
                        <td>${formattedLatitude || ''}</td>
                        <td>${formattedLongitude || ''}</td>
                        <td>${caseInfo.uploadTime ? new Date(caseInfo.uploadTime).toLocaleString() : ''}</td>
                        <td>${caseInfo.reportTime ? new Date(caseInfo.reportTime).toLocaleString() : ''}</td>
                        <td>${caseInfo.responseTime ? new Date(caseInfo.responseTime).toLocaleString() : ''}</td>
                        <td>${caseInfo.repairVendor || ''}</td>
                        <td>${repairTimeDiff}</td>
                        <td>${caseInfo.repairImageUrl ? `<a href="${caseInfo.repairImageUrl}" target="_blank">查看圖片</a>` : '無'}</td>
                    `;
                    tbody.appendChild(tr);
                });
            } else {
                tbody.innerHTML = "<tr><td colspan='14'>沒有已完成的案件</td></tr>";
            }
        })
        .catch(error => {
            console.error("Error fetching completed cases:", error);
            const tbody = document.getElementById("completed-table-body");
            tbody.innerHTML = `<tr><td colspan='14'>加載數據時出錯: ${error.message}</td></tr>`;
        });
}

function calculateTimeDifference(startTime, endTime) {
    if (!startTime || !endTime) {
        return '';
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    const diffInMs = end - start;

    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    const diffInHours = Math.floor((diffInMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    return `${diffInDays} 天 ${diffInHours} 小時`;
}

function addEventListenersToActiveCases() {
    document.querySelectorAll('button[data-case-id]').forEach(button => {
        const caseId = button.getAttribute('data-case-id');
        if (button.classList.contains('btn-primary')) {
            button.addEventListener('click', function() {
                uploadPhotoModal(caseId);
            });
        } else {
            button.addEventListener('click', function() {
                deleteCase(caseId);
            });
        }
    });
}

function showRepairModal(caseId) {
    document.getElementById('caseId').value = caseId;
    const repairModal = new bootstrap.Modal(document.getElementById('repairModal'));
    repairModal.show();
}

function handleRepairFormSubmit(event) {
    event.preventDefault();
    const caseId = document.getElementById('caseId').value;
    const reportTime = document.getElementById('reportTime').value;
    const responseTime = document.getElementById('responseTime').value;
    const repairVendor = document.getElementById('repairVendor').value;
    const repairImage = document.getElementById('repairImage').files[0];

    if (!caseId || !reportTime || !responseTime || !repairVendor) {
        alert("所有字段都是必需的");
        return;
    }

    const repairData = new FormData();
    repairData.append('caseId', caseId);
    repairData.append('reportTime', reportTime);
    repairData.append('responseTime', responseTime);
    repairData.append('repairVendor', repairVendor);
    repairData.append('status', '已處理');
    if (repairImage) {
        repairData.append('repairImage', repairImage);
    }

    fetch("/api/update-case-status", {
        method: "POST",
        body: repairData
    })
    .then(async response => {
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Unknown error');
        }
        return data;
    })
    .then(data => {
        alert(data.message);
        loadActiveCases();
        loadCompletedCases();
        const repairModal = bootstrap.Modal.getInstance(document.getElementById('repairModal'));
        repairModal.hide();
    })
    .catch(error => {
        alert("更新狀態失敗：" + error.message);
    });
}

function deleteCase(caseId) {
    if (confirm("確定要刪除這個案件嗎？")) {
        fetch("/api/delete-case", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ caseId })
        }).then(response => {
            if (response.ok) {
                alert("案件已刪除");
                loadActiveCases();
            } else {
                alert("刪除失敗，請稍後再試");
            }
        }).catch(error => {
            alert("刪除失敗：" + error.message);
        });
    }
}

function updateDropdown(caseId, status) {
    let selectElement = document.querySelector(`select[data-case-id="${caseId}"]`);
    if (selectElement) {
        selectElement.value = status;
    }
}

function handleStatusChange(event) {
    if (event.target.tagName === 'SELECT') {
        const selectElement = event.target;
        const caseId = selectElement.getAttribute('data-case-id');
        const newStatus = selectElement.value;

        if (newStatus === '已處理') {
            showRepairModal(caseId);
        } else {
            // 更新案件狀態到數據庫
            fetch('/api/update-case-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ caseId, status: newStatus })
            })
            .then(response => response.json())
            .then(() => {
                console.log('案件狀態已更新');
                alert('案件狀態已更新');
            })
            .catch(error => {
                console.error('更新案件狀態時出錯:', error);
                alert('更新案件狀態失敗，請稍後再試');
            });
        }
    }
}