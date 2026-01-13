const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const toleranceSlider = document.getElementById('tolerance');
        const jsonInput = document.getElementById('jsonInput');
        const errorDiv = document.getElementById('error');
        const statsDiv = document.getElementById('stats');
        
        let currentData = null;
        let scalePercent = 60;
        let savedGroups = []; // 저장된 그룹들의 배열
        let selectedPoints = []; // 선택된 점들의 배열: [{ groupIndex: number, pointIndex: number }]
        let currentTransform = null; // 현재 transform 함수 저장
        let draggingPoint = null; // 드래그 중인 점: { groupIndex, pointIndex, originalPos, startMousePos }
        let undoBackup = null; // 실행 취소를 위한 백업 (마지막 작업 1개)
        
        // 점 표시 On/Off 상태
        let showOriginalPoints = true;
        let showSimplifiedPoints = true;
        let showGroupPoints = true;
        
        // 슬라이더 값 업데이트
        toleranceSlider.addEventListener('input', (e) => {
            toleranceSlider.dataset.tooltip = parseFloat(e.target.value).toFixed(1);
            if (currentData) {
                visualize();
            }
        });
        // Tolerance ± 버튼 이벤트
        document.getElementById('tolDownBtn').addEventListener('click', function () {
            let v = parseFloat(toleranceSlider.value);
            v = Math.max(v - 0.3, parseFloat(toleranceSlider.min));
            toleranceSlider.value = v.toFixed(1);
            toleranceSlider.dataset.tooltip = v.toFixed(1);
            if (currentData) visualize();
        });
        document.getElementById('tolUpBtn').addEventListener('click', function () {
            let v = parseFloat(toleranceSlider.value);
            v = Math.min(v + 0.3, parseFloat(toleranceSlider.max));
            toleranceSlider.value = v.toFixed(1);
            toleranceSlider.dataset.tooltip = v.toFixed(1);
            if (currentData) visualize();
        });
        // Tolerance ±± 버튼 이벤트 (0.5씩)
        document.getElementById('bigTolDownBtn').addEventListener('click', function () {
            let v = parseFloat(toleranceSlider.value);
            v = Math.max(v - 0.5, parseFloat(toleranceSlider.min));
            toleranceSlider.value = v.toFixed(1);
            toleranceSlider.dataset.tooltip = v.toFixed(1);
            if (currentData) visualize();
        });
        document.getElementById('bigTolUpBtn').addEventListener('click', function () {
            let v = parseFloat(toleranceSlider.value);
            v = Math.min(v + 0.5, parseFloat(toleranceSlider.max));
            toleranceSlider.value = v.toFixed(1);
            toleranceSlider.dataset.tooltip = v.toFixed(1);
            if (currentData) visualize();
        });
        
        // 붙여넣기 버튼 이벤트
        document.getElementById('pasteBtn').addEventListener('click', async function() {
            try {
                const text = await navigator.clipboard.readText();
                jsonInput.value = text;
                jsonInput.focus();
            } catch (err) {
                console.error('붙여넣기 실패:', err);
                alert('붙여넣기에 실패했습니다. 클립보드 접근 권한을 확인해주세요.');
            }
        });
        
        // 점 표시 체크박스 이벤트 리스너
        document.getElementById('showOriginalPoints').addEventListener('change', function(e) {
            showOriginalPoints = e.target.checked;
            if (currentData) {
                visualize(); // 임시 시각화가 표시 중이면 다시 그리기
            } else if (savedGroups.length > 0) {
                drawAllGroups(); // 저장된 그룹이 있으면 다시 그리기
            }
        });
        
        document.getElementById('showSimplifiedPoints').addEventListener('change', function(e) {
            showSimplifiedPoints = e.target.checked;
            if (currentData) {
                visualize(); // 임시 시각화가 표시 중이면 다시 그리기
            } else if (savedGroups.length > 0) {
                drawAllGroups(); // 저장된 그룹이 있으면 다시 그리기
            }
        });
        
        document.getElementById('showGroupPoints').addEventListener('change', function(e) {
            showGroupPoints = e.target.checked;
            drawAllGroups(); // 저장된 그룹 다시 그리기
        });
        
        // Douglas-Peucker 알고리즘 구현
        function douglasPeucker(points, tolerance) {
            if (points.length <= 2) return points;
            
            // 첫 점과 마지막 점 사이의 거리 계산
            let maxDistance = 0;
            let maxIndex = 0;
            const start = points[0];
            const end = points[points.length - 1];
            
            for (let i = 1; i < points.length - 1; i++) {
                const distance = perpendicularDistance(points[i], start, end);
                if (distance > maxDistance) {
                    maxDistance = distance;
                    maxIndex = i;
                }
            }
            
            // 최대 거리가 허용 오차보다 크면 재귀적으로 분할
            if (maxDistance > tolerance) {
                const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
                const right = douglasPeucker(points.slice(maxIndex), tolerance);
                return left.slice(0, -1).concat(right);
            } else {
                return [start, end];
            }
        }
        
        // 점에서 선까지의 수직 거리 계산
        function perpendicularDistance(point, lineStart, lineEnd) {
            const dx = lineEnd.x - lineStart.x;
            const dy = lineEnd.y - lineStart.y;
            
            if (dx === 0 && dy === 0) {
                return Math.sqrt(
                    Math.pow(point.x - lineStart.x, 2) + 
                    Math.pow(point.y - lineStart.y, 2)
                );
            }
            
            const numerator = Math.abs(
                dy * point.x - dx * point.y + 
                lineEnd.x * lineStart.y - lineEnd.y * lineStart.x
            );
            const denominator = Math.sqrt(dx * dx + dy * dy);
            
            return numerator / denominator;
        }
        
        // JSON 파싱 및 포인트 추출
        function parseJSON() {
            try {
                errorDiv.style.display = 'none';
                const data = JSON.parse(jsonInput.value);
                
                if (!data.tiles || !Array.isArray(data.tiles)) {
                    throw new Error('tiles 배열이 필요합니다');
                }
                
                return data;
            } catch (e) {
                errorDiv.textContent = `JSON 파싱 오류: ${e.message}`;
                errorDiv.style.display = 'block';
                return null;
            }
        }
        
        // 저장된 그룹 목록 업데이트
        function updateGroupList() {
            const groupListDiv = document.getElementById('groupList');
            if (savedGroups.length === 0) {
                groupListDiv.innerHTML = '<p style="color: #aaa;">저장된 그룹이 없습니다.</p>';
                return;
            }
            
            let html = '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px;">';
            savedGroups.forEach((group, index) => {
                const color = group.color;
                const bgColor = group.selected ? '#4a4a4a' : '#3a3a3a';
                const borderStyle = group.selected ? `border: 2px solid ${color};` : '';
                html += `
                    <div onclick="selectGroup(${index})" style="display: flex; align-items: center; padding: 8px; background: ${bgColor}; border-radius: 4px; min-width: 180px; cursor: pointer; ${borderStyle}">
                        <input type="checkbox" id="group${index}" ${group.visible ? 'checked' : ''} 
                               onclick="event.stopPropagation(); toggleGroup(${index})" style="margin-right: 8px;">
                        <div style="width: 18px; height: 18px; background: ${color}; border: 2px solid #fff; margin-right: 8px; flex-shrink: 0;"></div>
                        <label for="group${index}" onclick="event.stopPropagation(); toggleGroup(${index})" style="cursor: pointer; color: #eee; font-size: 13px; white-space: nowrap; margin-right: 8px;">그룹 ${index + 1} (${group.points.length})</label>
                        <button onclick="event.stopPropagation(); deleteGroup(${index})" style="padding: 3px 6px; font-size: 11px; background: #e74c3c; color: white; border: none; border-radius: 3px; cursor: pointer;">×</button>
                    </div>
                `;
            });
            html += '</div>';
            groupListDiv.innerHTML = html;
        }
        
        // 그룹 표시/숨김 토글
        window.toggleGroup = function(index) {
            savedGroups[index].visible = !savedGroups[index].visible;
            updateGroupList();
            drawAllGroups();
        };
        
        // 그룹 선택/해제 (굵게 표시)
        window.selectGroup = function(index) {
            savedGroups[index].selected = !savedGroups[index].selected;
            updateGroupList();
            drawAllGroups();
        };
        
        // 좌표 편집 모드 시작
        window.editPointCoordinates = function(selectionIndex) {
            const sp = selectedPoints[selectionIndex];
            const group = savedGroups[sp.groupIndex];
            const point = group.points[sp.pointIndex];
            
            // 편집 UI 생성
            const editDiv = document.getElementById(`coord-${selectionIndex}`);
            editDiv.innerHTML = `
                <div style="display: flex; gap: 8px; align-items: center; margin-top: 4px;">
                    <input type="number" id="editX-${selectionIndex}" value="${point.x.toFixed(1)}" 
                           style="width: 70px; padding: 4px; background: #444; color: #fff; border: 1px solid #666; border-radius: 3px;" 
                           step="0.1" placeholder="X">
                    <input type="number" id="editY-${selectionIndex}" value="${point.y.toFixed(1)}" 
                           style="width: 70px; padding: 4px; background: #444; color: #fff; border: 1px solid #666; border-radius: 3px;" 
                           step="0.1" placeholder="Y">
                    <button onclick="savePointCoordinates(${selectionIndex})" 
                            style="padding: 4px 12px; background: #2d6a2f; color: white; border: none; border-radius: 3px; cursor: pointer;">✓</button>
                    <button onclick="updatePointInfo()" 
                            style="padding: 4px 12px; background: #666; color: white; border: none; border-radius: 3px; cursor: pointer;">✗</button>
                </div>
            `;
            
            // 첫 번째 입력 필드에 포커스
            document.getElementById(`editX-${selectionIndex}`).focus();
        };
        
        // 좌표 저장 (해당 그룹과 연결된 모든 그룹을 평행이동)
        window.savePointCoordinates = function(selectionIndex) {
            const sp = selectedPoints[selectionIndex];
            const group = savedGroups[sp.groupIndex];
            const oldPoint = group.points[sp.pointIndex];
            
            // 새 좌표 가져오기
            const newX = parseFloat(document.getElementById(`editX-${selectionIndex}`).value);
            const newY = parseFloat(document.getElementById(`editY-${selectionIndex}`).value);
            
            // 유효성 검사
            if (isNaN(newX) || isNaN(newY)) {
                alert('유효한 숫자를 입력해주세요.');
                return;
            }
            
            // 이동 거리 계산
            const deltaX = newX - oldPoint.x;
            const deltaY = newY - oldPoint.y;
            
            // 평행이동할 그룹들 찾기
            const groupsToMove = new Set([sp.groupIndex]); // 현재 그룹 포함
            
            // 연결된 점들이 속한 그룹들 찾기
            savedGroups.forEach((otherGroup, otherGroupIndex) => {
                otherGroup.points.forEach((otherPoint, otherPointIndex) => {
                    // 같은 좌표를 가진 점이 있으면 해당 그룹도 이동
                    if (otherPoint.x === oldPoint.x && otherPoint.y === oldPoint.y) {
                        groupsToMove.add(otherGroupIndex);
                    }
                });
            });
            
            // 선택된 모든 그룹의 모든 점들을 평행이동
            groupsToMove.forEach(groupIndex => {
                savedGroups[groupIndex].points.forEach(point => {
                    point.x += deltaX;
                    point.y += deltaY;
                });
            });
            
            // UI 업데이트
            updatePointInfo();
            drawAllGroups();
        };
        
        // 선택된 점 정보 업데이트
        function updatePointInfo() {
            const pointInfoSection = document.getElementById('pointInfoSection');
            const pointInfoDiv = document.getElementById('pointInfo');
            
            if (selectedPoints.length === 0) {
                pointInfoSection.style.display = 'none';
                return;
            }
            
            pointInfoSection.style.display = 'block';
            
            let html = '';
            
            selectedPoints.forEach((sp, idx) => {
                const group = savedGroups[sp.groupIndex];
                const point = group.points[sp.pointIndex];
                
                // 연결된 점들 찾기 (같은 좌표를 가진 다른 그룹의 점들)
                const connectedPoints = [];
                savedGroups.forEach((otherGroup, otherGroupIndex) => {
                    if (otherGroupIndex === sp.groupIndex) return; // 같은 그룹 제외
                    
                    otherGroup.points.forEach((otherPoint, otherPointIndex) => {
                        if (point.x === otherPoint.x && point.y === otherPoint.y) {
                            connectedPoints.push({
                                groupIndex: otherGroupIndex,
                                pointIndex: otherPointIndex,
                                color: otherGroup.color
                            });
                        }
                    });
                });
                
                html += `<div style="margin-bottom: 12px; padding: 8px; background: #333; border-radius: 4px; border-left: 4px solid ${group.color};">`;
                html += `<div style="font-weight: bold; margin-bottom: 4px;">📍 선택 ${idx + 1}</div>`;
                html += `<div>그룹: <span style="color: ${group.color}; font-weight: bold;">그룹 ${sp.groupIndex + 1}</span></div>`;
                html += `<div>포인트 인덱스: <strong>${sp.pointIndex}</strong></div>`;
                html += `<div id="coord-${idx}">좌표: <strong style="cursor: pointer; padding: 2px 6px; background: #444; border-radius: 3px;" onclick="editPointCoordinates(${idx})" title="클릭하여 편집">(${point.x.toFixed(1)}, ${point.y.toFixed(1)})</strong></div>`;
                
                if (connectedPoints.length > 0) {
                    html += `<div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #555;">`;
                    html += `<div style="color: #feca57; font-weight: bold;">🔗 연결된 점: ${connectedPoints.length}개</div>`;
                    connectedPoints.forEach(cp => {
                        html += `<div style="margin-left: 12px; margin-top: 2px;">`;
                        html += `• <span style="color: ${cp.color}; font-weight: bold;">그룹 ${cp.groupIndex + 1}</span> - 포인트 ${cp.pointIndex}`;
                        html += `</div>`;
                    });
                    html += `</div>`;
                } else {
                    html += `<div style="margin-top: 6px; color: #888;">연결된 점 없음</div>`;
                }
                
                html += `</div>`;
            });
            
            pointInfoDiv.innerHTML = html;
        }
        
        // 부분 그룹 생성 버튼 이벤트
        document.getElementById('createSubGroup').addEventListener('click', function() {
            createSubGroup();
        });
        
        // 끊어진 그룹 생성 버튼 이벤트
        document.getElementById('createBrokenGroup').addEventListener('click', function() {
            createBrokenGroup();
        });
        
        // 부분 그룹 생성 함수
        function createSubGroup() {
            // 1. 선택된 점이 정확히 2개인지 확인
            if (selectedPoints.length !== 2) {
                alert('한 그룹 내에서 정확히 2개의 점을 선택해주세요.');
                return;
            }
            
            // 2. 두 점이 같은 그룹에 속하는지 확인
            const point1 = selectedPoints[0];
            const point2 = selectedPoints[1];
            
            if (point1.groupIndex !== point2.groupIndex) {
                alert('같은 그룹 내의 점 2개를 선택해주세요.');
                return;
            }
            
            const groupIndex = point1.groupIndex;
            const group = savedGroups[groupIndex];
            
            // 3. 두 점의 인덱스를 정렬 (시작점, 끝점 결정)
            const startIdx = Math.min(point1.pointIndex, point2.pointIndex);
            const endIdx = Math.max(point1.pointIndex, point2.pointIndex);
            
            // 4. 두 점 사이의 점들 추출 (두 점 포함)
            const subPoints = group.points.slice(startIdx, endIdx + 1);
            
            if (subPoints.length < 2) {
                alert('부분 그룹을 생성할 수 없습니다. (최소 2개의 점 필요)');
                return;
            }
            
            // 5. 새로운 그룹 생성
            const colors = ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#feca57', '#ff6348', '#00d2d3'];
            const color = colors[savedGroups.length % colors.length];
            
            savedGroups.push({
                points: JSON.parse(JSON.stringify(subPoints)), // 깊은 복사
                color: color,
                visible: true,
                selected: false,
                originalCount: subPoints.length
            });
            
            // 6. UI 업데이트
            updateGroupList();
            drawAllGroups();
            
            console.log(`부분 그룹 생성: 그룹 ${groupIndex + 1}의 ${startIdx}번~${endIdx}번 점 (총 ${subPoints.length}개)`);
            alert(`새로운 그룹이 생성되었습니다! (${subPoints.length}개의 점)`);
        }
        
        // 끊어진 그룹 생성 함수
        function createBrokenGroup() {
            // 1. 선택된 점이 정확히 2개인지 확인
            if (selectedPoints.length !== 2) {
                alert('한 그룹 내에서 정확히 2개의 점을 선택해주세요.');
                return;
            }
            
            // 2. 두 점이 같은 그룹에 속하는지 확인
            const point1 = selectedPoints[0];
            const point2 = selectedPoints[1];
            
            if (point1.groupIndex !== point2.groupIndex) {
                alert('같은 그룹 내의 점 2개를 선택해주세요.');
                return;
            }
            
            const groupIndex = point1.groupIndex;
            const group = savedGroups[groupIndex];
            
            // 3. 두 점의 인덱스를 정렬 (시작점, 끝점 결정)
            const startIdx = Math.min(point1.pointIndex, point2.pointIndex);
            const endIdx = Math.max(point1.pointIndex, point2.pointIndex);
            
            // 4. 두 점 사이의 점들을 제외한 나머지 점들 추출
            // 0 ~ startIdx까지 + endIdx ~ 끝까지
            const brokenPoints = [
                ...group.points.slice(0, startIdx + 1),  // 시작부터 첫 번째 선택점까지 (포함)
                ...group.points.slice(endIdx)             // 두 번째 선택점부터 끝까지 (포함)
            ];
            
            if (brokenPoints.length < 2) {
                alert('끊어진 그룹을 생성할 수 없습니다. (최소 2개의 점 필요)');
                return;
            }
            
            // 5. 새로운 그룹 생성
            const colors = ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#feca57', '#ff6348', '#00d2d3'];
            const color = colors[savedGroups.length % colors.length];
            
            savedGroups.push({
                points: JSON.parse(JSON.stringify(brokenPoints)), // 깊은 복사
                color: color,
                visible: true,
                selected: false,
                originalCount: brokenPoints.length
            });
            
            // 6. UI 업데이트
            updateGroupList();
            drawAllGroups();
            
            const excludedCount = endIdx - startIdx - 1;
            console.log(`끊어진 그룹 생성: 그룹 ${groupIndex + 1}의 0~${startIdx}번 + ${endIdx}~끝 점 (중간 ${excludedCount}개 제외, 총 ${brokenPoints.length}개)`);
            alert(`새로운 끊어진 그룹이 생성되었습니다!\n포함: ${brokenPoints.length}개의 점\n제외: ${excludedCount}개의 점 (인덱스 ${startIdx + 1}~${endIdx - 1})`);
        }
        
        // 그룹 삭제
        window.deleteGroup = function(index) {
            if (confirm(`그룹 ${index + 1}을(를) 삭제하시겠습니까?`)) {
                savedGroups.splice(index, 1);
                
                // 삭제된 그룹의 선택된 점 제거 및 인덱스 조정
                selectedPoints = selectedPoints
                    .filter(sp => sp.groupIndex !== index)
                    .map(sp => ({
                        groupIndex: sp.groupIndex > index ? sp.groupIndex - 1 : sp.groupIndex,
                        pointIndex: sp.pointIndex
                    }));
                
                updateGroupList();
                drawAllGroups();
            }
        };
        
        // 시각화 함수
        function visualize() {
            const data = jsonInput.value ? parseJSON() : null;
            if (!data) return;
            
            currentData = data;
            const tolerance = parseFloat(toleranceSlider.value);
            
            // 포인트 배열 생성
            const points = data.tiles.map(tile => ({
                x: tile.c,
                y: tile.r
            }));
            
            // Douglas-Peucker 알고리즘 적용
            const simplifiedPoints = douglasPeucker(points, tolerance);
            
            // 통계 업데이트
            const reduction = ((1 - simplifiedPoints.length / points.length) * 100).toFixed(1);
            document.getElementById('originalPoints').textContent = points.length;
            document.getElementById('simplifiedPoints').textContent = simplifiedPoints.length;
            document.getElementById('reduction').textContent = `${reduction}%`;
            statsDiv.style.display = 'block';

            // 클립보드 복사용 DP 결과 저장
            window.dpResult = simplifiedPoints;
            
            // 자동으로 그룹 저장
            if (window.dpResult && Array.isArray(window.dpResult) && window.dpResult.length > 0) {
                // 색상 배열 (그룹마다 다른 색상)
                const colors = ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#feca57', '#ff6348', '#00d2d3'];
                const color = colors[savedGroups.length % colors.length];
                
                savedGroups.push({
                    points: JSON.parse(JSON.stringify(window.dpResult)), // 깊은 복사
                    color: color,
                    visible: true,
                    selected: false,
                    originalCount: currentData ? currentData.tiles.length : 0
                });
                
                // UI 업데이트
                updateGroupList();
                drawAllGroups();
                
                // textarea 초기화
                jsonInput.value = '';
                currentData = null;
                window.dpResult = null;
                
                // 통계 숨기기
                statsDiv.style.display = 'none';
            } else {
                // DP 결과가 없으면 현재 데이터만 임시로 그리기
                drawVisualization(points, simplifiedPoints);
            }
        }
        

        // 저장된 모든 그룹 그리기
        function drawAllGroups() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            // 표시할 그룹들만 필터링
            const visibleGroups = savedGroups.filter(g => g.visible);
            if (visibleGroups.length === 0) return;
            
            // 모든 표시할 그룹의 점들을 합쳐서 범위 계산
            let allPoints = [];
            visibleGroups.forEach(group => {
                allPoints = allPoints.concat(group.points);
            });
            
            if (allPoints.length === 0) return;
            
            const minX = Math.min(...allPoints.map(p => p.x));
            const maxX = Math.max(...allPoints.map(p => p.x));
            const minY = Math.min(...allPoints.map(p => p.y));
            const maxY = Math.max(...allPoints.map(p => p.y));
            
            const padding = 40;
            const baseScaleX = (canvas.width - padding * 2) / (maxX - minX || 1);
            const baseScaleY = (canvas.height - padding * 2) / (maxY - minY || 1);
            const scale = Math.min(baseScaleX, baseScaleY) * (scalePercent / 100);
            
            const offsetX = padding + (canvas.width - padding * 2 - (maxX - minX) * scale) / 2;
            const offsetY = padding + (canvas.height - padding * 2 - (maxY - minY) * scale) / 2;
            
            const transform = (p) => ({
                x: (p.x - minX) * scale + offsetX,
                y: (p.y - minY) * scale + offsetY
            });
            
            // 현재 transform 함수 저장 (클릭 이벤트에서 사용)
            currentTransform = transform;
            
            // 각 그룹 그리기
            visibleGroups.forEach((group, idx) => {
                const points = group.points;
                const color = group.color;
                const lineWidth = group.selected ? 6 : 3; // 선택된 그룹은 더 굵게
                
                // 경로 그리기
                ctx.strokeStyle = color;
                ctx.lineWidth = lineWidth;
                ctx.setLineDash([]);
                ctx.beginPath();
                points.forEach((p, i) => {
                    const tp = transform(p);
                    if (i === 0) ctx.moveTo(tp.x, tp.y);
                    else ctx.lineTo(tp.x, tp.y);
                });
                ctx.stroke();
                
                // 포인트 그리기 (showGroupPoints가 true일 때만)
                if (showGroupPoints) {
                    points.forEach((p, i) => {
                        const tp = transform(p);
                        const groupIndex = savedGroups.findIndex(g => g === group);
                        const selectedIndex = selectedPoints.findIndex(sp => sp.groupIndex === groupIndex && sp.pointIndex === i);
                        const isSelected = selectedIndex !== -1;
                        
                        // 선택된 점들을 timestamp 기준으로 정렬하여 최근 2개 찾기
                        const sortedSelected = [...selectedPoints].sort((a, b) => b.timestamp - a.timestamp);
                        let pointColor = color;
                        let strokeColor = 'white';
                        let pointSize = 6;
                        let strokeWidth = 2;
                        let fontWeight = '11px sans-serif';
                        let fontColor = '#333';
                        
                        if (isSelected) {
                            pointSize = 10;
                            strokeWidth = 3;
                            fontWeight = 'bold 13px sans-serif';
                            fontColor = '#000';
                            
                            // 가장 최근 점(1번): 파란색
                            if (sortedSelected.length > 0 && 
                                sortedSelected[0].groupIndex === groupIndex && 
                                sortedSelected[0].pointIndex === i) {
                                strokeColor = '#0000ff';
                            }
                            // 두 번째 최근 점(0번): 빨간색
                            else if (sortedSelected.length > 1 && 
                                     sortedSelected[1].groupIndex === groupIndex && 
                                     sortedSelected[1].pointIndex === i) {
                                strokeColor = '#ff0000';
                            }
                            // 나머지 선택된 점: 노란색
                            else {
                                strokeColor = '#ffff00';
                            }
                        }
                        
                        ctx.fillStyle = pointColor;
                        ctx.beginPath();
                        ctx.arc(tp.x, tp.y, pointSize, 0, Math.PI * 2);
                        ctx.fill();
                        ctx.strokeStyle = strokeColor;
                        ctx.lineWidth = strokeWidth;
                        ctx.stroke();
                        
                        // 포인트 번호
                        ctx.fillStyle = fontColor;
                        ctx.font = fontWeight;
                        ctx.fillText(i, tp.x + 10, tp.y - 10);
                    });
                }
            });
        }
        
        // 캔버스 그리기
        function drawVisualization(originalPoints, simplifiedPoints) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            if (originalPoints.length === 0) return;
            
            // 좌표 범위 계산
            const minX = Math.min(...originalPoints.map(p => p.x));
            const maxX = Math.max(...originalPoints.map(p => p.x));
            const minY = Math.min(...originalPoints.map(p => p.y));
            const maxY = Math.max(...originalPoints.map(p => p.y));
            
            const padding = 40;
            const baseScaleX = (canvas.width - padding * 2) / (maxX - minX || 1);
            const baseScaleY = (canvas.height - padding * 2) / (maxY - minY || 1);
            const scale = Math.min(baseScaleX, baseScaleY) * (scalePercent / 100);
            
            const offsetX = padding + (canvas.width - padding * 2 - (maxX - minX) * scale) / 2;
            const offsetY = padding + (canvas.height - padding * 2 - (maxY - minY) * scale) / 2;
            
            const transform = (p) => ({
                x: (p.x - minX) * scale + offsetX,
                y: (p.y - minY) * scale + offsetY
            });
            
            // 원본 경로 (연한 회색 점선)
            ctx.strokeStyle = '#ccc';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            originalPoints.forEach((p, i) => {
                const tp = transform(p);
                if (i === 0) ctx.moveTo(tp.x, tp.y);
                else ctx.lineTo(tp.x, tp.y);
            });
            ctx.stroke();
            
            // 원본 포인트 (작은 회색 점) - showOriginalPoints가 true일 때만
            if (showOriginalPoints) {
                originalPoints.forEach(p => {
                    const tp = transform(p);
                    ctx.fillStyle = '#ddd';
                    ctx.beginPath();
                    ctx.arc(tp.x, tp.y, 3, 0, Math.PI * 2);
                    ctx.fill();
                });
            }
            
            // 단순화된 경로 (굵은 보라색 실선)
            ctx.strokeStyle = '#667eea';
            ctx.lineWidth = 3;
            ctx.setLineDash([]);
            ctx.beginPath();
            simplifiedPoints.forEach((p, i) => {
                const tp = transform(p);
                if (i === 0) ctx.moveTo(tp.x, tp.y);
                else ctx.lineTo(tp.x, tp.y);
            });
            ctx.stroke();
            
            // 단순화된 포인트 (큰 보라색 점) - showSimplifiedPoints가 true일 때만
            if (showSimplifiedPoints) {
                simplifiedPoints.forEach((p, i) => {
                    const tp = transform(p);
                    ctx.fillStyle = '#764ba2';
                    ctx.beginPath();
                    ctx.arc(tp.x, tp.y, 6, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = 'white';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                    
                    // 포인트 번호
                    ctx.fillStyle = '#333';
                    ctx.font = '11px sans-serif';
                    ctx.fillText(i, tp.x + 10, tp.y - 10);
                });
            }
        }
        
        // 캔버스 클릭으로 점 선택
        canvas.addEventListener('click', function(event) {
            // 드래그 직후에는 클릭 이벤트 무시 (이미 mouseup에서 처리됨)
            if (!currentTransform || savedGroups.length === 0) return;
            
            const rect = canvas.getBoundingClientRect();
            const clickX = event.clientX - rect.left;
            const clickY = event.clientY - rect.top;
            
            let closestPoint = null;
            let minDistance = 15; // 15픽셀 이내의 점만 선택
            
            // 표시 중인 모든 그룹의 모든 점과 거리 비교
            savedGroups.forEach((group, groupIndex) => {
                if (!group.visible) return;
                
                group.points.forEach((point, pointIndex) => {
                    const tp = currentTransform(point);
                    const distance = Math.sqrt(
                        Math.pow(tp.x - clickX, 2) + 
                        Math.pow(tp.y - clickY, 2)
                    );
                    
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestPoint = { groupIndex, pointIndex, point };
                    }
                });
            });
            
            // 가까운 점이 있으면 선택/해제 처리
            if (closestPoint) {
                const { groupIndex, pointIndex } = closestPoint;
                
                // 같은 점이 이미 선택되어 있는지 확인
                const alreadySelectedIndex = selectedPoints.findIndex(sp => 
                    sp.groupIndex === groupIndex && sp.pointIndex === pointIndex
                );
                
                if (alreadySelectedIndex !== -1) {
                    // 같은 점을 다시 클릭하면 선택 해제
                    selectedPoints.splice(alreadySelectedIndex, 1);
                    console.log(`선택 해제: 그룹 ${groupIndex + 1}, 포인트 ${pointIndex}`);
                } else {
                    // 전체적으로 이미 2개가 선택되어 있으면 가장 오래된 점을 제거
                    if (selectedPoints.length >= 2) {
                        const oldestPoint = selectedPoints.reduce((oldest, current) => 
                            current.timestamp < oldest.timestamp ? current : oldest
                        );
                        const oldestIndex = selectedPoints.findIndex(sp => 
                            sp.groupIndex === oldestPoint.groupIndex && 
                            sp.pointIndex === oldestPoint.pointIndex
                        );
                        selectedPoints.splice(oldestIndex, 1);
                        console.log(`최대 2개 제한으로 그룹 ${oldestPoint.groupIndex + 1}의 포인트 ${oldestPoint.pointIndex} 자동 해제`);
                    }
                    
                    // 새로운 점 추가
                    selectedPoints.push({ groupIndex, pointIndex, timestamp: Date.now() });
                    console.log(`선택 추가: 그룹 ${groupIndex + 1}, 포인트 ${pointIndex}, 좌표 (${closestPoint.point.x.toFixed(1)}, ${closestPoint.point.y.toFixed(1)})`);
                }
            } else {
                // 빈 공간 클릭 시 모든 선택 해제
                if (selectedPoints.length > 0) {
                    selectedPoints = [];
                    console.log('모든 선택 해제');
                }
            }
            
            updatePointInfo();
            drawAllGroups();
        });
        
        // 마우스 다운: 드래그 시작 (모든 표시된 그룹의 점)
        canvas.addEventListener('mousedown', function(event) {
            if (!currentTransform || savedGroups.length === 0) return;
            
            const rect = canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            
            let closestPoint = null;
            let minDistance = 15; // 15픽셀 이내의 점만
            
            // 표시된 모든 그룹의 점들 확인 (선택 여부와 무관)
            savedGroups.forEach((group, groupIndex) => {
                if (!group.visible) return; // 표시된 그룹만
                
                group.points.forEach((point, pointIndex) => {
                    const tp = currentTransform(point);
                    const distance = Math.sqrt(
                        Math.pow(tp.x - mouseX, 2) + 
                        Math.pow(tp.y - mouseY, 2)
                    );
                    
                    if (distance < minDistance) {
                        minDistance = distance;
                        closestPoint = { groupIndex, pointIndex, point };
                    }
                });
            });
            
            if (closestPoint) {
                draggingPoint = {
                    groupIndex: closestPoint.groupIndex,
                    pointIndex: closestPoint.pointIndex,
                    originalPos: { 
                        x: closestPoint.point.x, 
                        y: closestPoint.point.y 
                    },
                    startMousePos: { x: mouseX, y: mouseY },
                    wasDragged: false,
                    ctrlKey: event.ctrlKey  // CTRL 키 상태 저장
                };
                canvas.style.cursor = 'grabbing';
            }
        });
        
        // 마우스 무브: 드래그 중
        canvas.addEventListener('mousemove', function(event) {
            if (!draggingPoint) {
                canvas.style.cursor = 'default';
                return;
            }
            
            const rect = canvas.getBoundingClientRect();
            const mouseX = event.clientX - rect.left;
            const mouseY = event.clientY - rect.top;
            
            // 마우스 이동 거리 (화면 좌표)
            const screenDx = mouseX - draggingPoint.startMousePos.x;
            const screenDy = mouseY - draggingPoint.startMousePos.y;
            
            // 최소 5픽셀 이상 움직여야 드래그로 인식
            const dragThreshold = 5;
            const dragDistance = Math.sqrt(screenDx * screenDx + screenDy * screenDy);
            
            if (!draggingPoint.wasDragged && dragDistance < dragThreshold) {
                // 아직 threshold를 넘지 않았으면 드래그 시작 안 함
                return;
            }
            
            draggingPoint.wasDragged = true;
            
            // 화면 좌표를 데이터 좌표로 변환하기 위해 스케일 역산
            // transform 함수에서 사용하는 scale을 역으로 계산
            const visibleGroups = savedGroups.filter(g => g.visible);
            if (visibleGroups.length === 0) return;
            
            let allPoints = [];
            visibleGroups.forEach(group => {
                allPoints = allPoints.concat(group.points);
            });
            
            const minX = Math.min(...allPoints.map(p => p.x));
            const maxX = Math.max(...allPoints.map(p => p.x));
            const minY = Math.min(...allPoints.map(p => p.y));
            const maxY = Math.max(...allPoints.map(p => p.y));
            
            const padding = 40;
            const baseScaleX = (canvas.width - padding * 2) / (maxX - minX || 1);
            const baseScaleY = (canvas.height - padding * 2) / (maxY - minY || 1);
            const scale = Math.min(baseScaleX, baseScaleY) * (scalePercent / 100);
            
            // 화면 이동 거리를 데이터 좌표 이동 거리로 변환
            const dataDx = screenDx / scale;
            const dataDy = screenDy / scale;
            
            // 드래그 중인 점만 임시로 이동 (미리보기)
            savedGroups[draggingPoint.groupIndex].points[draggingPoint.pointIndex] = {
                x: draggingPoint.originalPos.x + dataDx,
                y: draggingPoint.originalPos.y + dataDy
            };
            
            drawAllGroups();
        });
        
        // 마우스 업: 드래그 종료
        canvas.addEventListener('mouseup', function(event) {
            if (!draggingPoint) return;
            
            if (draggingPoint.wasDragged) {
                // 드래그한 거리 계산
                const movedPoint = savedGroups[draggingPoint.groupIndex].points[draggingPoint.pointIndex];
                const dx = movedPoint.x - draggingPoint.originalPos.x;
                const dy = movedPoint.y - draggingPoint.originalPos.y;
                
                // 먼저 드래그한 점을 원래 위치로 복원 (연결 감지를 위해)
                savedGroups[draggingPoint.groupIndex].points[draggingPoint.pointIndex] = {
                    x: draggingPoint.originalPos.x,
                    y: draggingPoint.originalPos.y
                };
                
                const draggedGroup = savedGroups[draggingPoint.groupIndex];
                const isCtrlPressed = draggingPoint.ctrlKey;  // CTRL 키 눌림 상태
                
                if (isCtrlPressed) {
                    // CTRL 키가 눌린 경우: 해당 점과 겹치는 점들만 이동
                    const pointsToMove = []; // { groupIndex, pointIndex }
                    
                    // 드래그한 점과 같은 좌표를 가진 모든 점 찾기
                    savedGroups.forEach((group, groupIndex) => {
                        if (!group.visible) return; // 보이지 않는 그룹 제외
                        
                        group.points.forEach((point, pointIndex) => {
                            if (point.x === draggingPoint.originalPos.x && 
                                point.y === draggingPoint.originalPos.y) {
                                pointsToMove.push({ groupIndex, pointIndex });
                            }
                        });
                    });
                    
                    // 찾은 점들만 이동
                    pointsToMove.forEach(({ groupIndex, pointIndex }) => {
                        savedGroups[groupIndex].points[pointIndex] = {
                            x: draggingPoint.originalPos.x + dx,
                            y: draggingPoint.originalPos.y + dy
                        };
                    });
                    
                    console.log(`그룹 ${draggingPoint.groupIndex + 1} 점 ${draggingPoint.pointIndex} 이동 완료 [CTRL 키 - 점만 이동]`);
                    console.log(`  이동 벡터: (${dx.toFixed(2)}, ${dy.toFixed(2)})`);
                    console.log(`  이동된 점: ${pointsToMove.length}개 (겹치는 점 포함)`);
                    if (pointsToMove.length > 1) {
                        const affectedGroups = [...new Set(pointsToMove.map(p => p.groupIndex + 1))];
                        console.log(`  영향받은 그룹: ${affectedGroups.join(', ')}`);
                    }
                } else {
                    // 일반 드래그 (그룹 선택 여부 무관): 그룹 전체와 연결된 그룹들 평행이동
                    const linkedGroupIndices = new Set([draggingPoint.groupIndex]); // 드래그한 그룹 포함
                    
                    // 드래그한 그룹의 모든 점을 확인 (원래 위치)
                    draggedGroup.points.forEach(point => {
                        // 같은 좌표를 가진 다른 그룹의 점들 찾기
                        savedGroups.forEach((otherGroup, otherIndex) => {
                            if (otherIndex === draggingPoint.groupIndex) return; // 같은 그룹 제외
                            if (!otherGroup.visible) return; // 보이지 않는 그룹 제외
                            
                            otherGroup.points.forEach(otherPoint => {
                                if (point.x === otherPoint.x && point.y === otherPoint.y) {
                                    linkedGroupIndices.add(otherIndex);
                                }
                            });
                        });
                    });
                    
                    // 연결된 모든 그룹을 평행이동
                    linkedGroupIndices.forEach(groupIndex => {
                        const group = savedGroups[groupIndex];
                        group.points = group.points.map(p => ({
                            x: p.x + dx,
                            y: p.y + dy
                        }));
                    });
                    
                    console.log(`그룹 ${draggingPoint.groupIndex + 1} 드래그 이동 완료`);
                    console.log(`  이동 벡터: (${dx.toFixed(2)}, ${dy.toFixed(2)})`);
                    if (linkedGroupIndices.size > 1) {
                        console.log(`  연결된 그룹: ${Array.from(linkedGroupIndices).map(i => i + 1).join(', ')}`);
                        console.log(`  총 ${linkedGroupIndices.size}개 그룹 함께 이동`);
                    }
                }
                
                drawAllGroups();
            } else {
                // 드래그하지 않고 클릭만 한 경우, 원래 위치로 복원
                savedGroups[draggingPoint.groupIndex].points[draggingPoint.pointIndex] = {
                    x: draggingPoint.originalPos.x,
                    y: draggingPoint.originalPos.y
                };
                drawAllGroups();
            }
            
            canvas.style.cursor = 'default';
            draggingPoint = null; // mouseup에서 즉시 초기화
        });
        
        // localStorage에 그룹 저장
        function saveToLocalStorage() {
            const dataToSave = {
                groups: savedGroups,
                timestamp: new Date().toISOString(),
                version: '1.0'
            };
            localStorage.setItem('block3_savedGroups', JSON.stringify(dataToSave));
            console.log('localStorage에 저장 완료:', savedGroups.length + '개 그룹');
        }
        
        // localStorage에서 그룹 불러오기
        function loadFromLocalStorage() {
            try {
                const saved = localStorage.getItem('block3_savedGroups');
                if (saved) {
                    const data = JSON.parse(saved);
                    if (data.groups && Array.isArray(data.groups)) {
                        savedGroups = data.groups;
                        console.log('localStorage에서 복원 완료:', savedGroups.length + '개 그룹');
                        updateGroupList();
                        drawAllGroups();
                        return true;
                    }
                }
            } catch (e) {
                console.error('localStorage 불러오기 실패:', e);
            }
            return false;
        }
        
        // 초기 데이터 로드
        window.addEventListener('load', () => {
            // localStorage에서 먼저 복원 시도
            const restored = loadFromLocalStorage();
            
            // localStorage에 데이터가 없으면 예제 데이터 로드
            if (!restored) {
                // 예제 데이터가 문서에 있으면 자동으로 로드
                const exampleData = document.querySelector('antml\\:document_content');
                if (exampleData) {
                    jsonInput.value = exampleData.textContent;
                }
            }
        });

        // 모든 그룹 저장 버튼 이벤트
        document.getElementById('saveGroups').addEventListener('click', function () {
            if (savedGroups.length === 0) {
                alert('저장할 그룹이 없습니다.');
                return;
            }
            
            const dataToSave = {
                groups: savedGroups,
                timestamp: new Date().toISOString(),
                version: '1.0',
                totalGroups: savedGroups.length
            };
            const jsonStr = JSON.stringify(dataToSave, null, 2);
            
            // localStorage에 저장
            saveToLocalStorage();
            
            // 클립보드에 복사
            navigator.clipboard.writeText(jsonStr)
                .then(() => alert(`모든 그룹 저장 완료!\n- ${savedGroups.length}개 그룹\n- localStorage에 저장됨\n- 클립보드에 복사됨`))
                .catch(() => alert(`localStorage에 저장됨 (${savedGroups.length}개 그룹)\n클립보드 복사는 실패했습니다.`));
        });
        
        // 창 닫을 때 자동 저장
        window.addEventListener('beforeunload', function(e) {
            if (savedGroups.length > 0) {
                saveToLocalStorage();
            }
        });
        
        // DP 결과 클립보드 복사 버튼 이벤트
        document.getElementById('copyDP').addEventListener('click', function () {
            if (window.dpResult && Array.isArray(window.dpResult)) {
                const jsonStr = JSON.stringify(window.dpResult, null, 2);
                navigator.clipboard.writeText(jsonStr)
                  .then(() => alert('DP 결과가 클립보드에 복사되었습니다!'))
                  .catch(() => alert('복사에 실패했습니다.'));  
            } else {
                alert('DP 결과가 없습니다. 먼저 "시각화 생성"을 해 주세요.');
            }
        });

        // 1번 점을 0번 점 위치로 이동시키는 버튼 이벤트
        document.getElementById('alignPoints').addEventListener('click', function () {
            // 최근 2개 점 찾기
            const sortedSelected = [...selectedPoints].sort((a, b) => b.timestamp - a.timestamp);
            
            if (sortedSelected.length < 2) {
                alert('최소 2개의 점을 선택해야 합니다. (현재: ' + sortedSelected.length + '개)');
                return;
            }
            
            // 실행 취소를 위해 현재 상태 백업 (deep copy)
            undoBackup = JSON.parse(JSON.stringify(savedGroups));
            
            const point1 = sortedSelected[0]; // 1번 (파란색, 가장 최근)
            const point0 = sortedSelected[1]; // 0번 (빨간색, 두 번째 최근)
            
            // 파란색(1번)이 빨간색(0번) 위치로 이동
            const fromGroup = point1.groupIndex;
            const toGroup = point0.groupIndex;
            const fromPointIndex = point1.pointIndex;
            const toPointIndex = point0.pointIndex;
            
            // 목표 점(0번, 빨간색)의 좌표 가져오기
            const targetPoint = savedGroups[toGroup].points[toPointIndex];
            
            // 이동할 점(1번, 파란색)의 원래 좌표
            const beforePoint = savedGroups[fromGroup].points[fromPointIndex];
            
            // 이동 벡터 계산 (dx, dy)
            const dx = targetPoint.x - beforePoint.x;
            const dy = targetPoint.y - beforePoint.y;
            
            // 1번 그룹의 모든 점들을 같은 벡터만큼 평행이동
            const groupToMove = savedGroups[fromGroup];
            groupToMove.points = groupToMove.points.map(p => ({
                x: p.x + dx,
                y: p.y + dy
            }));
            
            console.log(`그룹 ${fromGroup + 1} (파란색) → 그룹 ${toGroup + 1} (빨간색) 위치로 이동 완료`);
            console.log(`  이동 벡터: (${dx.toFixed(1)}, ${dy.toFixed(1)})`);
            console.log(`  기준 점 이동: (${beforePoint.x.toFixed(1)}, ${beforePoint.y.toFixed(1)}) → (${(beforePoint.x + dx).toFixed(1)}, ${(beforePoint.y + dy).toFixed(1)})`);
            console.log(`  총 ${groupToMove.points.length}개 점 이동`);
            
            // 화면 재렌더링
            drawAllGroups();
        });
        
        // 0번과 1번 점을 교환하는 버튼 이벤트
        document.getElementById('swapPoints').addEventListener('click', function () {
            // 최근 2개 점 찾기
            const sortedSelected = [...selectedPoints].sort((a, b) => b.timestamp - a.timestamp);
            
            if (sortedSelected.length < 2) {
                alert('최소 2개의 점을 선택해야 합니다. (현재: ' + sortedSelected.length + '개)');
                return;
            }
            
            // timestamp를 교환하여 0번과 1번을 바꿈
            const temp = sortedSelected[0].timestamp;
            sortedSelected[0].timestamp = sortedSelected[1].timestamp;
            sortedSelected[1].timestamp = temp;
            
            console.log('0번(빨간색) ↔ 1번(파란색) 교환 완료');
            
            // 화면 재렌더링 (색상이 바뀌어 표시됨)
            drawAllGroups();
        });

        // 겹친 점을 분리하는 버튼 이벤트
        document.getElementById('separatePoints').addEventListener('click', function () {
            // 최근 선택된 점 찾기
            const sortedSelected = [...selectedPoints].sort((a, b) => b.timestamp - a.timestamp);
            
            if (sortedSelected.length < 1) {
                alert('먼저 점을 선택해주세요.');
                return;
            }
            
            // 실행 취소를 위해 현재 상태 백업 (deep copy)
            undoBackup = JSON.parse(JSON.stringify(savedGroups));
            
            const recentPoint = sortedSelected[0]; // 1번 (파란색, 가장 최근)
            const recentCoord = savedGroups[recentPoint.groupIndex].points[recentPoint.pointIndex];
            
            console.log(`가장 최근 선택된 점: 그룹 ${recentPoint.groupIndex + 1}, 포인트 ${recentPoint.pointIndex}, 좌표 (${recentCoord.x.toFixed(1)}, ${recentCoord.y.toFixed(1)})`);
            
            // 같은 좌표를 가진 모든 점들 찾기 (표시 중인 그룹만)
            const overlappingPoints = [];
            savedGroups.forEach((group, groupIndex) => {
                if (!group.visible) return;
                
                group.points.forEach((point, pointIndex) => {
                    if (point.x === recentCoord.x && point.y === recentCoord.y) {
                        overlappingPoints.push({ groupIndex, pointIndex, point });
                    }
                });
            });
            
            console.log(`같은 좌표에 있는 점들: ${overlappingPoints.length}개`);
            
            if (overlappingPoints.length < 2) {
                alert('해당 위치에 겹친 점이 없습니다. (점이 1개만 있음)');
                return;
            }
            
            // 1번 점을 제외한 다른 점 중 첫 번째 것 선택
            let pointToMove = null;
            for (const op of overlappingPoints) {
                if (op.groupIndex !== recentPoint.groupIndex || op.pointIndex !== recentPoint.pointIndex) {
                    pointToMove = op;
                    break;
                }
            }
            
            // 만약 모든 점이 같은 점이라면 (동일 그룹, 동일 인덱스) 리스트의 두 번째 것 사용
            if (!pointToMove && overlappingPoints.length > 1) {
                pointToMove = overlappingPoints[1];
            }
            
            if (!pointToMove) {
                alert('분리할 점을 찾을 수 없습니다.');
                return;
            }
            
            // 선택된 그룹 전체를 (10, 10) 만큼 평행이동
            const groupToMove = savedGroups[pointToMove.groupIndex];
            groupToMove.points = groupToMove.points.map(p => ({
                x: p.x + 10,
                y: p.y + 10
            }));
            
            console.log(`그룹 ${pointToMove.groupIndex + 1} 전체 분리 이동 완료`);
            console.log(`  이동 벡터: (10, 10)`);
            console.log(`  총 ${groupToMove.points.length}개 점 이동`);
            
            // 화면 재렌더링
            drawAllGroups();
        });

        // 선택된 그룹 색상 변경 버튼 이벤트
        document.getElementById('changeSelectedGroupColors').addEventListener('click', function () {
            // 선택된 그룹들 찾기
            const selectedGroups = savedGroups
                .map((group, index) => ({ group, index }))
                .filter(item => item.group.selected);
            
            if (selectedGroups.length === 0) {
                alert('먼저 그룹을 선택해주세요. (그룹 영역을 클릭)');
                return;
            }
            
            // 랜덤 색상 생성 함수
            function getRandomColor() {
                const colors = [
                    '#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a', 
                    '#feca57', '#ff6348', '#00d2d3', '#ee5a6f', '#c471ed',
                    '#12c2e9', '#f857a6', '#3494e6', '#ec008c', '#fc6767',
                    '#5f72bd', '#9921e8', '#a8eb12', '#06beb6', '#48b1bf'
                ];
                return colors[Math.floor(Math.random() * colors.length)];
            }
            
            // 각 선택된 그룹의 색상을 랜덤하게 변경
            selectedGroups.forEach(({ group, index }) => {
                const oldColor = group.color;
                group.color = getRandomColor();
                console.log(`그룹 ${index + 1} 색상 변경: ${oldColor} → ${group.color}`);
            });
            
            // UI 업데이트
            updateGroupList();
            drawAllGroups();
        });

        // 확대/축소 및 배율 Range Bar 이벤트
        function updateZoomUI() {
            document.getElementById('zoomPercent').textContent = scalePercent + '%';
            document.getElementById('zoomRange').value = scalePercent;
        }
        document.getElementById('zoomInBtn').addEventListener('click', function () {
            if (scalePercent < 100) {
                scalePercent += 5;
                if (scalePercent > 100) scalePercent = 100;
                updateZoomUI();
                drawAllGroups();
            }
        });
// 15% 확대/축소 큰 버튼 이벤트 (중첩 벗어나서 바깥에 이동)
document.getElementById('bigZoomInBtn').addEventListener('click', function () {
    if (scalePercent < 100) {
        scalePercent += 15;
        if (scalePercent > 100) scalePercent = 100;
        updateZoomUI();
        drawAllGroups();
    }
});
document.getElementById('bigZoomOutBtn').addEventListener('click', function () {
    if (scalePercent > 5) {
        scalePercent -= 15;
        if (scalePercent < 5) scalePercent = 5;
        updateZoomUI();
        drawAllGroups();
    }
});
        document.getElementById('zoomOutBtn').addEventListener('click', function () {
            if (scalePercent > 5) {
                scalePercent -= 5;
                if (scalePercent < 5) scalePercent = 5;
                updateZoomUI();
                drawAllGroups();
            }
        });
        document.getElementById('zoomRange').addEventListener('input', function (e) {
            scalePercent = parseInt(e.target.value, 10);
            updateZoomUI();
            drawAllGroups();
        });
        
        // 캔버스 및 전역에서 키보드 이벤트 처리
        const handleKeyDown = function(e) {
            // Ctrl+Z로 실행 취소
            if (e.ctrlKey && e.key === 'z') {
                e.preventDefault();
                if (undoBackup) {
                    savedGroups = JSON.parse(JSON.stringify(undoBackup));
                    console.log('실행 취소 완료 (Ctrl+Z)');
                    drawAllGroups();
                } else {
                    console.log('취소할 작업이 없습니다.');
                }
                return;
            }
            
            // +, = 키로 확대 (Shift + = 또는 단순 = 키)
            if (e.key === '+' || e.key === '=') {
                e.preventDefault();
                if (scalePercent < 100) {
                    scalePercent += 5;
                    if (scalePercent > 100) scalePercent = 100;
                    updateZoomUI();
                    drawAllGroups();
                }
            }
            // - 키로 축소
            else if (e.key === '-' || e.key === '_') {
                e.preventDefault();
                if (scalePercent > 5) {
                    scalePercent -= 5;
                    if (scalePercent < 5) scalePercent = 5;
                    updateZoomUI();
                    drawAllGroups();
                }
            }
        };
        
        // 캔버스와 문서 전체에 이벤트 리스너 추가
        canvas.addEventListener('keydown', handleKeyDown);
        document.addEventListener('keydown', handleKeyDown);
        
        // 캔버스를 클릭하면 포커스를 받아 키보드 이벤트를 받을 수 있도록 설정
        canvas.setAttribute('tabindex', '0');
        canvas.focus();
        
        updateZoomUI();