/**
 * 저장된 그룹 데이터를 캔버스에 렌더링하는 함수
 * 
 * @param {Object} jsonData - '모든 그룹 저장'으로 저장한 JSON 데이터
 * @param {HTMLCanvasElement} canvas - 그릴 캔버스 엘리먼트
 * @param {Object} options - 옵션 설정 (선택사항)
 * @param {number} options.scalePercent - 스케일 비율 (기본값: 60)
 * @param {Object} options.viewOffset - 화면 오프셋 (기본값: {x: 0, y: 0})
 * @param {boolean} options.showPoints - 점 표시 여부 (기본값: true)
 * @param {boolean} options.showLines - 선 표시 여부 (기본값: true)
 * @param {number} options.pointSize - 점 크기 (기본값: 4)
 * @param {number} options.lineWidth - 선 두께 (기본값: 2)
 * 
 * @example
 * // 기본 사용법
 * const jsonData = JSON.parse(clipboardText);
 * const canvas = document.getElementById('myCanvas');
 * renderSavedGroups(jsonData, canvas);
 * 
 * @example
 * // 옵션 사용
 * renderSavedGroups(jsonData, canvas, {
 *   scalePercent: 80,
 *   pointSize: 6,
 *   lineWidth: 3
 * });
 */
function renderSavedGroups(jsonData, canvas, options = {}) {
    // 기본 옵션 설정
    const config = {
        scalePercent: options.scalePercent ?? 60,
        viewOffset: options.viewOffset ?? { x: 0, y: 0 },
        showPoints: options.showPoints ?? true,
        showLines: options.showLines ?? true,
        pointSize: options.pointSize ?? 4,
        lineWidth: options.lineWidth ?? 2
    };

    // 데이터 검증
    if (!jsonData || !jsonData.groups || !Array.isArray(jsonData.groups)) {
        console.error('잘못된 JSON 데이터 형식입니다. groups 배열이 필요합니다.');
        return false;
    }

    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
        console.error('유효한 HTMLCanvasElement가 필요합니다.');
        return false;
    }

    const ctx = canvas.getContext('2d');
    const groups = jsonData.groups;

    console.log('=== 렌더링 시작 ===');
    console.log('그룹 수:', groups.length);
    console.log('캔버스 크기:', canvas.width, 'x', canvas.height);
    console.log('옵션:', config);

    // 캔버스 초기화
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 모든 점의 바운딩 박스 계산
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    groups.forEach(group => {
        if (group.visible !== false && group.points && group.points.length > 0) {
            group.points.forEach(point => {
                minX = Math.min(minX, point.x);
                minY = Math.min(minY, point.y);
                maxX = Math.max(maxX, point.x);
                maxY = Math.max(maxY, point.y);
            });
        }
    });

    // 데이터의 중심점 계산
    const dataCenterX = (minX + maxX) / 2;
    const dataCenterY = (minY + maxY) / 2;

    console.log('데이터 범위:', { minX, minY, maxX, maxY });
    console.log('데이터 중심:', { dataCenterX, dataCenterY });

    // 좌표 변환 함수 (데이터 중심을 캔버스 중앙에 배치)
    function transform(x, y) {
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const scale = config.scalePercent / 100;
        return {
            x: centerX + (x - dataCenterX) * scale + config.viewOffset.x,
            y: centerY - (y - dataCenterY) * scale + config.viewOffset.y
        };
    }

    // 각 그룹 그리기
    groups.forEach((group, groupIndex) => {
        // visible이 false인 경우 건너뛰기
        if (group.visible === false) {
            console.log(`그룹 ${groupIndex + 1}: 숨김 처리됨`);
            return;
        }

        const color = group.color || '#667eea';
        const points = group.points;

        console.log(`그룹 ${groupIndex + 1}:`, {
            color,
            pointCount: points.length,
            visible: group.visible,
            firstPoint: points[0]
        });

        if (!points || points.length === 0) {
            console.log(`그룹 ${groupIndex + 1}: 점이 없음`);
            return;
        }

        // 선 그리기
        if (config.showLines && points.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = color;
            ctx.lineWidth = config.lineWidth;

            const firstPoint = transform(points[0].x, points[0].y);
            ctx.moveTo(firstPoint.x, firstPoint.y);

            for (let i = 1; i < points.length; i++) {
                const p = transform(points[i].x, points[i].y);
                ctx.lineTo(p.x, p.y);
            }

            ctx.stroke();
        }

        // 점 그리기
        if (config.showPoints) {
            points.forEach((point, pointIndex) => {
                const p = transform(point.x, point.y);

                // 점 원 그리기
                ctx.beginPath();
                ctx.arc(p.x, p.y, config.pointSize, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();

                // 점 테두리
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 1;
                ctx.stroke();

                // 그룹이 선택된 경우 강조 표시
                if (group.selected) {
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, config.pointSize + 3, 0, Math.PI * 2);
                    ctx.strokeStyle = '#ffff00';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            });
        }
    });

    console.log('=== 렌더링 완료 ===');
    return true;
}

/**
 * 클립보드에서 JSON 데이터를 읽어 캔버스에 렌더링하는 헬퍼 함수
 * 
 * @param {HTMLCanvasElement} canvas - 그릴 캔버스 엘리먼트
 * @param {Object} options - 옵션 설정 (선택사항)
 * @returns {Promise<boolean>} 성공 여부
 * 
 * @example
 * const canvas = document.getElementById('myCanvas');
 * renderFromClipboard(canvas)
 *   .then(() => console.log('렌더링 완료'))
 *   .catch(err => console.error('렌더링 실패:', err));
 */
async function renderFromClipboard(canvas, options = {}) {
    try {
        const text = await navigator.clipboard.readText();
        const jsonData = JSON.parse(text);
        return renderSavedGroups(jsonData, canvas, options);
    } catch (err) {
        console.error('클립보드에서 데이터를 읽는 중 오류 발생:', err);
        return false;
    }
}

/**
 * localStorage에서 JSON 데이터를 읽어 캔버스에 렌더링하는 헬퍼 함수
 * 
 * @param {HTMLCanvasElement} canvas - 그릴 캔버스 엘리먼트
 * @param {string} storageKey - localStorage 키 (기본값: 'block3_savedGroups')
 * @param {Object} options - 옵션 설정 (선택사항)
 * @returns {boolean} 성공 여부
 * 
 * @example
 * const canvas = document.getElementById('myCanvas');
 * renderFromLocalStorage(canvas);
 */
function renderFromLocalStorage(canvas, storageKey = 'block3_savedGroups', options = {}) {
    try {
        const text = localStorage.getItem(storageKey);
        if (!text) {
            console.error('localStorage에 데이터가 없습니다.');
            return false;
        }
        const jsonData = JSON.parse(text);
        return renderSavedGroups(jsonData, canvas, options);
    } catch (err) {
        console.error('localStorage에서 데이터를 읽는 중 오류 발생:', err);
        return false;
    }
}

/**
 * 그룹 정보를 콘솔에 출력하는 헬퍼 함수
 * 
 * @param {Object} jsonData - JSON 데이터
 */
function printGroupInfo(jsonData) {
    if (!jsonData || !jsonData.groups) {
        console.error('잘못된 JSON 데이터');
        return;
    }

    console.log('=== 저장된 그룹 정보 ===');
    console.log(`버전: ${jsonData.version || 'N/A'}`);
    console.log(`저장 시간: ${jsonData.timestamp || 'N/A'}`);
    console.log(`총 그룹 수: ${jsonData.totalGroups || jsonData.groups.length}`);
    console.log('');

    jsonData.groups.forEach((group, index) => {
        console.log(`그룹 ${index + 1}:`);
        console.log(`  - 색상: ${group.color}`);
        console.log(`  - 점 개수: ${group.points.length}`);
        console.log(`  - 표시 여부: ${group.visible !== false ? '예' : '아니오'}`);
        console.log(`  - 선택 여부: ${group.selected ? '예' : '아니오'}`);
        if (group.originalCount) {
            console.log(`  - 원본 점 개수: ${group.originalCount}`);
        }
    });
}
const canvas = document.getElementById('canvas');
        const jsonInput = document.getElementById('jsonInput');
        const scaleSlider = document.getElementById('scaleSlider');
        const scaleValue = document.getElementById('scaleValue');
        const pointSizeSlider = document.getElementById('pointSizeSlider');
        const pointSizeValue = document.getElementById('pointSizeValue');
        const lineWidthSlider = document.getElementById('lineWidthSlider');
        const lineWidthValue = document.getElementById('lineWidthValue');
        const showPointsCheck = document.getElementById('showPointsCheck');
        const showLinesCheck = document.getElementById('showLinesCheck');

        // textarea 직접 붙여넣기 이벤트
        jsonInput.addEventListener('paste', (e) => {
            // 붙여넣기 후 잠시 뒤에 자동 렌더링 시도
            setTimeout(() => {
                if (jsonInput.value.trim()) {
                    try {
                        const jsonData = JSON.parse(jsonInput.value);
                        console.log('textarea에 붙여넣기 감지:', jsonData);
                    } catch (err) {
                        console.log('JSON 파싱 대기 중...');
                    }
                }
            }, 100);
        });

        // 실시간 렌더링 함수
        function reRender() {
            if (!jsonInput.value.trim()) return;
            
            try {
                const jsonData = JSON.parse(jsonInput.value);
                const options = {
                    scalePercent: parseInt(scaleSlider.value),
                    pointSize: parseInt(pointSizeSlider.value),
                    lineWidth: parseInt(lineWidthSlider.value),
                    showPoints: showPointsCheck.checked,
                    showLines: showLinesCheck.checked
                };
                renderSavedGroups(jsonData, canvas, options);
            } catch (err) {
                console.error('렌더링 오류:', err);
            }
        }

        // 슬라이더 값 표시 업데이트 + 실시간 렌더링
        scaleSlider.addEventListener('input', (e) => {
            scaleValue.textContent = e.target.value + '%';
            reRender();
        });

        pointSizeSlider.addEventListener('input', (e) => {
            pointSizeValue.textContent = e.target.value;
            reRender();
        });

        lineWidthSlider.addEventListener('input', (e) => {
            lineWidthValue.textContent = e.target.value;
            reRender();
        });

        // 체크박스 변경 시 실시간 렌더링
        showPointsCheck.addEventListener('change', reRender);
        showLinesCheck.addEventListener('change', reRender);

        // 클립보드에서 붙여넣기
        document.getElementById('pasteBtn').addEventListener('click', async () => {
            try {
                const text = await navigator.clipboard.readText();
                jsonInput.value = text;
                alert('클립보드 내용을 붙여넣었습니다!');
            } catch (err) {
                alert('클립보드 읽기 실패: ' + err.message);
            }
        });

        // localStorage에서 불러오기
        document.getElementById('loadFromStorageBtn').addEventListener('click', () => {
            const text = localStorage.getItem('block3_savedGroups');
            if (text) {
                jsonInput.value = text;
                alert('localStorage에서 데이터를 불러왔습니다!');
            } else {
                alert('localStorage에 저장된 데이터가 없습니다.');
            }
        });

        // 렌더링
        document.getElementById('renderBtn').addEventListener('click', () => {
            try {
                const jsonData = JSON.parse(jsonInput.value);
                const options = {
                    scalePercent: parseInt(scaleSlider.value),
                    pointSize: parseInt(pointSizeSlider.value),
                    lineWidth: parseInt(lineWidthSlider.value),
                    showPoints: showPointsCheck.checked,
                    showLines: showLinesCheck.checked
                };
                
                const success = renderSavedGroups(jsonData, canvas, options);
                if (success) {
                    alert('렌더링 완료!');
                } else {
                    alert('렌더링 실패. 콘솔을 확인하세요.');
                }
            } catch (err) {
                alert('JSON 파싱 오류: ' + err.message);
            }
        });

        // 캔버스 지우기
        document.getElementById('clearBtn').addEventListener('click', () => {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        });

        // 정보 출력
        document.getElementById('infoBtn').addEventListener('click', () => {
            try {
                const jsonData = JSON.parse(jsonInput.value);
                printGroupInfo(jsonData);
                alert('그룹 정보를 콘솔에 출력했습니다. F12를 눌러 확인하세요.');
            } catch (err) {
                alert('JSON 파싱 오류: ' + err.message);
            }
        });

        // 페이지 로드 시 localStorage에서 자동 불러오기 시도
        window.addEventListener('load', () => {
            const text = localStorage.getItem('block3_savedGroups');
            if (text) {
                jsonInput.value = text;
                // 자동 렌더링
                try {
                    const jsonData = JSON.parse(text);
                    renderSavedGroups(jsonData, canvas, {
                        scalePercent: 60,
                        pointSize: 4,
                        lineWidth: 2
                    });
                } catch (err) {
                    console.error('자동 렌더링 실패:', err);
                }
            }
        });