const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const messageDiv = document.getElementById('message');
        
        let imageData = null;
        let foundRegions = []; // 전역 배열: 찾은 영역 저장

        // 방향별 시작점 계산 함수
        function getStartPoint(inputX, inputY, size, direction) {
            switch(direction) {
                case 'se': // 우하 (기본) - 입력점이 좌상
                    return { x: inputX, y: inputY };
                case 'nw': // 좌상 - 입력점이 우하
                    return { x: inputX - size + 1, y: inputY - size + 1 };
                case 'ne': // 우상 - 입력점이 좌하
                    return { x: inputX, y: inputY - size + 1 };
                case 'sw': // 좌하 - 입력점이 우상
                    return { x: inputX - size + 1, y: inputY };
                case 'n': // 상 - 입력점이 하단 중앙
                    return { x: inputX - Math.floor((size - 1) / 2), y: inputY - size + 1 };
                case 's': // 하 - 입력점이 상단 중앙
                    return { x: inputX - Math.floor((size - 1) / 2), y: inputY };
                case 'w': // 좌 - 입력점이 우측 중앙
                    return { x: inputX - size + 1, y: inputY - Math.floor((size - 1) / 2) };
                case 'e': // 우 - 입력점이 좌측 중앙
                    return { x: inputX, y: inputY - Math.floor((size - 1) / 2) };
                case 'c': // 중앙 - 입력점이 중심
                    return { x: inputX - Math.floor(size / 2), y: inputY - Math.floor(size / 2) };
                default:
                    return { x: inputX, y: inputY };
            }
        }

        // 방향 이름 가져오기
        function getDirectionName(direction) {
            const names = {
                'se': '우하(↘)',
                'nw': '좌상(↖)',
                'ne': '우상(↗)',
                'sw': '좌하(↙)',
                'n': '상(↑)',
                's': '하(↓)',
                'w': '좌(←)',
                'e': '우(→)',
                'c': '중앙(●)'
            };
            return names[direction] || direction;
        }

        // 이미지 붙여넣기 이벤트
        document.addEventListener('paste', function(e) {
            e.preventDefault();
            
            const items = e.clipboardData.items;
            for (let i = 0; i < items.length; i++) {
                if (items[i].type.indexOf('image') !== -1) {
                    const blob = items[i].getAsFile();
                    const reader = new FileReader();
                    
                    reader.onload = function(event) {
                        const img = new Image();
                        img.onload = function() {
                            canvas.width = img.width;
                            canvas.height = img.height;
                            ctx.drawImage(img, 0, 0);
                            imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                            
                            // LocalStorage에 이미지 저장
                            try {
                                localStorage.setItem('savedImage', event.target.result);
                                console.log('이미지가 LocalStorage에 저장되었습니다.');
                            } catch (e) {
                                console.error('LocalStorage 저장 실패:', e);
                            }
                            
                            // 모든 방향 버튼 활성화
                            ['NW', 'N', 'NE', 'W', 'SE', 'E', 'SW', 'S', 'C'].forEach(dir => {
                                document.getElementById('btn' + dir).disabled = false;
                            });
                            
                            showMessage('이미지가 로드되었습니다. 크기: ' + img.width + 'x' + img.height, 'info');
                        };
                        img.src = event.target.result;
                    };
                    reader.readAsDataURL(blob);
                    break;
                }
            }
        });

        // 픽셀이 흰색인지 확인 (임계값 200 이상을 흰색으로 간주)
        function isWhitePixel(x, y) {
            if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
                return false;
            }
            
            const index = (y * canvas.width + x) * 4;
            const r = imageData.data[index];
            const g = imageData.data[index + 1];
            const b = imageData.data[index + 2];
            
            // RGB 모두 200 이상이면 흰색으로 간주
            return r > 200 && g > 200 && b > 200;
        }

        // 특정 크기의 사각형이 모두 흰색인지 확인
        function isWhiteRectangle(startX, startY, size) {
            for (let y = startY; y < startY + size; y++) {
                for (let x = startX; x < startX + size; x++) {
                    if (!isWhitePixel(x, y)) {
                        return false;
                    }
                }
            }
            return true;
        }

        // 사각형의 픽셀 상태를 아스키 아트로 생성
        function getAsciiArt(startX, startY, size) {
            let ascii = [];
            for (let y = startY; y < startY + size; y++) {
                let row = '';
                for (let x = startX; x < startX + size; x++) {
                    row += isWhitePixel(x, y) ? 'x' : '_';
                }
                ascii.push(row);
            }
            return ascii.join('\n');
        }

        // 영역 찾기 메인 함수
        function findRectangle(direction = 'se') {
            if (!imageData) {
                showMessage('먼저 이미지를 붙여넣으세요!', 'error');
                return;
            }

            const inputX = parseInt(document.getElementById('startX').value);
            const inputY = parseInt(document.getElementById('startY').value);

            if (inputX < 0 || inputY < 0 || inputX >= canvas.width || inputY >= canvas.height) {
                showMessage('시작 좌표가 이미지 범위를 벗어났습니다!', 'error');
                return;
            }

            let maxSize = 0;
            let maxArea = 0;
            let messages = [];
            
            messages.push(`<strong>확장 방향: ${getDirectionName(direction)}</strong><br>`);

            // 1x1, 2x2, 3x3 ... 8x8 순서로 탐색
            for (let size = 1; size <= 8; size++) {
                const area = size * size;
                
                // 방향에 따라 실제 사각형의 시작점 계산
                const startPoint = getStartPoint(inputX, inputY, size, direction);
                const startX = startPoint.x;
                const startY = startPoint.y;
                
                if (isWhiteRectangle(startX, startY, size)) {
                    maxSize = size;
                    maxArea = area;
                    const endX = startX + size - 1;
                    const endY = startY + size - 1;
                    messages.push(`${area} (${startX},${startY})~(${endX},${endY}) : Good ✓`);
                    
                    // 캔버스에 찾은 영역 표시
                    drawRectangle(startX, startY, size, 'lime');
                } else {
                    // 실패 시 아스키 아트로 어떤 픽셀이 검은색인지 표시
                    const asciiArt = getAsciiArt(startX, startY, size);
                    messages.push(`넓이 ${area}인 사각형 찾기 실패 ✗`);
                    messages.push(`<pre style="background-color: #f0f0f0; padding: 10px; margin: 5px 0; display: inline-block; font-family: monospace; line-height: 1.2;">${asciiArt}</pre>`);
                    messages.push(`<span style="font-size: 12px; color: #666;">(x: 흰색 픽셀, _: 검은색 픽셀)</span>`);
                    break;
                }
            }

            // 결과 저장
            if (maxSize > 0) {
                const finalStartPoint = getStartPoint(inputX, inputY, maxSize, direction);
                const region = {
                    inputX: inputX,
                    inputY: inputY,
                    startX: finalStartPoint.x,
                    startY: finalStartPoint.y,
                    size: maxSize,
                    area: maxArea,
                    endX: finalStartPoint.x + maxSize - 1,
                    endY: finalStartPoint.y + maxSize - 1,
                    direction: direction
                };
                foundRegions.push(region);
                
                messages.push(`<br><strong>최종 결과: 넓이 ${maxArea} (${maxSize}x${maxSize}) 사각형을 찾았습니다!</strong>`);
                messages.push(`입력 좌표: (${inputX},${inputY})`);
                messages.push(`저장된 영역: (${region.startX},${region.startY}) ~ (${region.endX},${region.endY})`);
                
                updateRegionsList();
            } else {
                messages.push('<br><strong>흰색 영역을 찾을 수 없습니다.</strong>');
            }

            showMessage(messages.join('<br>'), maxSize > 0 ? 'result' : 'error');
        }

        // 캔버스에 사각형 그리기
        function drawRectangle(x, y, size, color) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, size, size);
        }

        // 찾은 영역 목록 업데이트
        function updateRegionsList() {
            const list = document.getElementById('regionsList');
            if (foundRegions.length === 0) {
                list.innerHTML = '<div style="color: #999;">아직 찾은 영역이 없습니다.</div>';
                return;
            }

            let html = '';
            foundRegions.forEach((region, index) => {
                html += `<div class="region-item">
                    ${index + 1}. 넓이: ${region.area} (${region.size}x${region.size}) | 
                    방향: ${getDirectionName(region.direction)} | 
                    입력: (${region.inputX}, ${region.inputY}) | 
                    영역: (${region.startX}, ${region.startY}) ~ (${region.endX}, ${region.endY})
                </div>`;
            });
            list.innerHTML = html;
        }

        // 메시지 표시
        function showMessage(msg, type) {
            messageDiv.className = type;
            messageDiv.innerHTML = msg;
        }

        // 결과 초기화
        function clearResults() {
            foundRegions = [];
            messageDiv.innerHTML = '';
            updateRegionsList();
            
            // 캔버스 다시 그리기 (사각형 제거)
            if (imageData) {
                ctx.putImageData(imageData, 0, 0);
            }
        }

        // LocalStorage에서 이미지 불러오기
        function loadImageFromStorage() {
            const savedImage = localStorage.getItem('savedImage');
            if (savedImage) {
                const img = new Image();
                img.onload = function() {
                    canvas.width = img.width;
                    canvas.height = img.height;
                    ctx.drawImage(img, 0, 0);
                    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                    
                    // 모든 방향 버튼 활성화
                    ['NW', 'N', 'NE', 'W', 'SE', 'E', 'SW', 'S', 'C'].forEach(dir => {
                        document.getElementById('btn' + dir).disabled = false;
                    });
                    
                    showMessage('저장된 이미지가 자동으로 로드되었습니다. 크기: ' + img.width + 'x' + img.height, 'info');
                };
                img.src = savedImage;
            }
        }

        // 초기화
        updateRegionsList();
        loadImageFromStorage();