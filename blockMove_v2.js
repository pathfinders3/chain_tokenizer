const canvas = document.getElementById('canvas');
        const ctx = canvas.getContext('2d');
        const messageDiv = document.getElementById('message');
        
        let imageData = null;
        let foundRegions = []; // 전역 배열: 찾은 영역 저장
        let currentRegion = null; // 현재 표시 중인 영역 정보

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

        // 작은 캔버스에 픽셀을 확대하여 표시
        function createPixelCanvas(startX, startY, size, foundStartX, foundStartY, foundSize) {
            const pixelSize = 10; // 각 픽셀을 10px × 10px로 확대
            const smallCanvas = document.createElement('canvas');
            smallCanvas.width = size * pixelSize;
            smallCanvas.height = size * pixelSize;
            const smallCtx = smallCanvas.getContext('2d');

            for (let y = 0; y < size; y++) {
                for (let x = 0; x < size; x++) {
                    const imgX = startX + x;
                    const imgY = startY + y;
                    
                    // 이미 찾은 영역의 절대 좌표로 확인
                    const isInFoundArea = foundSize > 0 && 
                                         imgX >= foundStartX && imgX < foundStartX + foundSize &&
                                         imgY >= foundStartY && imgY < foundStartY + foundSize;
                    
                    let color;
                    if (isInFoundArea) {
                        color = 'lime'; // 녹색으로 표시
                    } else {
                        // 원본 이미지의 실제 RGB 색상 가져오기
                        if (imgX >= 0 && imgX < canvas.width && imgY >= 0 && imgY < canvas.height) {
                            const index = (imgY * canvas.width + imgX) * 4;
                            const r = imageData.data[index];
                            const g = imageData.data[index + 1];
                            const b = imageData.data[index + 2];
                            color = `rgb(${r}, ${g}, ${b})`;
                        } else {
                            color = '#555'; // 이미지 범위 밖은 회색
                        }
                    }
                    
                    smallCtx.fillStyle = color;
                    smallCtx.fillRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
                    
                    // 픽셀 경계선 그리기
                    smallCtx.strokeStyle = '#666';
                    smallCtx.lineWidth = 0.5;
                    smallCtx.strokeRect(x * pixelSize, y * pixelSize, pixelSize, pixelSize);
                }
            }
            
            return smallCanvas.toDataURL();
        }

        // 각 변의 외부 픽셀 색상 개수 계산
        function countEdgePixels(startX, startY, size) {
            const result = {
                top: { black: 0, white: 0 },
                bottom: { black: 0, white: 0 },
                left: { black: 0, white: 0 },
                right: { black: 0, white: 0 }
            };

            // 윗변 (y = startY - 1, x = startX to startX + size - 1)
            if (startY > 0) {
                for (let x = startX; x < startX + size; x++) {
                    if (x >= 0 && x < canvas.width) {
                        if (isWhitePixel(x, startY - 1)) {
                            result.top.white++;
                        } else {
                            result.top.black++;
                        }
                    }
                }
            }

            // 아랫변 (y = startY + size, x = startX to startX + size - 1)
            if (startY + size < canvas.height) {
                for (let x = startX; x < startX + size; x++) {
                    if (x >= 0 && x < canvas.width) {
                        if (isWhitePixel(x, startY + size)) {
                            result.bottom.white++;
                        } else {
                            result.bottom.black++;
                        }
                    }
                }
            }

            // 좌변 (x = startX - 1, y = startY to startY + size - 1)
            if (startX > 0) {
                for (let y = startY; y < startY + size; y++) {
                    if (y >= 0 && y < canvas.height) {
                        if (isWhitePixel(startX - 1, y)) {
                            result.left.white++;
                        } else {
                            result.left.black++;
                        }
                    }
                }
            }

            // 우변 (x = startX + size, y = startY to startY + size - 1)
            if (startX + size < canvas.width) {
                for (let y = startY; y < startY + size; y++) {
                    if (y >= 0 && y < canvas.height) {
                        if (isWhitePixel(startX + size, y)) {
                            result.right.white++;
                        } else {
                            result.right.black++;
                        }
                    }
                }
            }

            return result;
        }

        // 정보 버튼에 색상 개수 업데이트
        // 정보 버튼에 색상 개수 업데이트
        function updateInfoButtons(startX, startY, size) {
            // 현재 영역 정보 저장
            currentRegion = { startX, startY, size };
            
            const edgePixels = countEdgePixels(startX, startY, size);

            // 텍스트 포맷: 0개인 색상은 표시하지 않음
            const formatEdgeText = (blackCount, whiteCount) => {
                let text = '';
                if (blackCount > 0) text += `B${blackCount}`;
                if (whiteCount > 0) text += `W${whiteCount}`;
                return text;
            };

            // 대각선 픽셀 체크 (1개만)
            const checkDiagonalPixel = (x, y) => {
                if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
                    return '';
                }
                return isWhitePixel(x, y) ? 'W1' : 'B1';
            };

            const topText = formatEdgeText(edgePixels.top.black, edgePixels.top.white);
            const bottomText = formatEdgeText(edgePixels.bottom.black, edgePixels.bottom.white);
            const leftText = formatEdgeText(edgePixels.left.black, edgePixels.left.white);
            const rightText = formatEdgeText(edgePixels.right.black, edgePixels.right.white);

            // 대각선 위치
            const nwText = checkDiagonalPixel(startX - 1, startY - 1);  // 좌상
            const neText = checkDiagonalPixel(startX + size, startY - 1);  // 우상
            const swText = checkDiagonalPixel(startX - 1, startY + size);  // 좌하
            const seText = checkDiagonalPixel(startX + size, startY + size);  // 우하

            document.getElementById('infoNW').textContent = nwText;
            document.getElementById('infoN').textContent = topText;
            document.getElementById('infoNE').textContent = neText;
            document.getElementById('infoW').textContent = leftText;
            document.getElementById('infoSE').textContent = seText;
            document.getElementById('infoE').textContent = rightText;
            document.getElementById('infoSW').textContent = swText;
            document.getElementById('infoS').textContent = bottomText;
            document.getElementById('infoC').textContent = '';
        }

        // 정보 버튼 초기화
        function clearInfoButtons() {
            ['NW', 'N', 'NE', 'W', 'SE', 'E', 'SW', 'S', 'C'].forEach(dir => {
                document.getElementById('info' + dir).textContent = '';
            });
            currentRegion = null;
        }

        // 특정 변의 점들 정보를 표시하는 함수
        function showEdgePointsInfo(edge) {
            if (!currentRegion) {
                showMessage('먼저 영역을 찾아주세요!', 'error');
                return;
            }

            const { startX, startY, size } = currentRegion;
            let points = [];
            let edgeName = '';

            switch(edge) {
                case 'top': // 상
                    edgeName = '상단';
                    if (startY > 0) {
                        for (let x = startX; x < startX + size; x++) {
                            if (x >= 0 && x < canvas.width) {
                                const isWhite = isWhitePixel(x, startY - 1);
                                points.push({ x, y: startY - 1, isWhite });
                            }
                        }
                    }
                    break;
                
                case 'bottom': // 하
                    edgeName = '하단';
                    if (startY + size < canvas.height) {
                        for (let x = startX; x < startX + size; x++) {
                            if (x >= 0 && x < canvas.width) {
                                const isWhite = isWhitePixel(x, startY + size);
                                points.push({ x, y: startY + size, isWhite });
                            }
                        }
                    }
                    break;
                
                case 'left': // 좌
                    edgeName = '좌측';
                    if (startX > 0) {
                        for (let y = startY; y < startY + size; y++) {
                            if (y >= 0 && y < canvas.height) {
                                const isWhite = isWhitePixel(startX - 1, y);
                                points.push({ x: startX - 1, y, isWhite });
                            }
                        }
                    }
                    break;
                
                case 'right': // 우
                    edgeName = '우측';
                    if (startX + size < canvas.width) {
                        for (let y = startY; y < startY + size; y++) {
                            if (y >= 0 && y < canvas.height) {
                                const isWhite = isWhitePixel(startX + size, y);
                                points.push({ x: startX + size, y, isWhite });
                            }
                        }
                    }
                    break;
            }

            // 결과 메시지 생성
            if (points.length === 0) {
                showMessage(`${edgeName} 변의 점이 없습니다 (이미지 경계에 닿음)`, 'info');
                return;
            }

            const blackPoints = points.filter(p => !p.isWhite);
            const whitePoints = points.filter(p => p.isWhite);

            let html = `<div style="padding: 10px;"><strong>${edgeName} 변의 점 정보</strong><br><br>`;
            html += `총 ${points.length}개 점: `;
            html += `<span style="color: black; background: white; padding: 2px 6px; border-radius: 3px; font-weight: bold;">검은 점 ${blackPoints.length}개</span> `;
            html += `<span style="color: #666; background: #f0f0f0; padding: 2px 6px; border-radius: 3px; font-weight: bold;">흰 점 ${whitePoints.length}개</span><br><br>`;

            // 검은 점 표시
            if (blackPoints.length > 0) {
                html += '<div style="margin-bottom: 15px;">';
                html += '<strong style="background: black; color: white; padding: 3px 8px; border-radius: 3px;">● 검은 점</strong><br>';
                html += '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">';
                blackPoints.forEach(p => {
                    html += `<div style="background: black; color: white; padding: 6px 10px; border-radius: 4px; font-family: monospace; font-size: 13px;">(${p.x}, ${p.y})</div>`;
                });
                html += '</div></div>';
            }

            // 흰 점 표시
            if (whitePoints.length > 0) {
                html += '<div style="margin-bottom: 10px;">';
                html += '<strong style="background: white; color: black; padding: 3px 8px; border-radius: 3px; border: 1px solid #ccc;">○ 흰 점</strong><br>';
                html += '<div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px;">';
                whitePoints.forEach(p => {
                    html += `<div style="background: white; color: black; padding: 6px 10px; border-radius: 4px; border: 1px solid #ccc; font-family: monospace; font-size: 13px;">(${p.x}, ${p.y})</div>`;
                });
                html += '</div></div>';
            }

            html += '</div>';
            showMessage(html, 'result');
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
            let maxStartX = 0;
            let maxStartY = 0;
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
                    maxStartX = startX;
                    maxStartY = startY;
                    const endX = startX + size - 1;
                    const endY = startY + size - 1;
                    messages.push(`${area} (${startX},${startY})~(${endX},${endY}) : Good ✓`);
                    
                    // 캔버스에 찾은 영역 표시
                    drawRectangle(startX, startY, size, 'lime');
                } else {
                    // 실패 시 작은 캔버스로 픽셀 상태 표시
                    const canvasDataUrl = createPixelCanvas(startX, startY, size, maxStartX, maxStartY, maxSize);
                    messages.push(`넓이 ${area}인 사각형 찾기 실패 ✗`);
                    messages.push(`<div style="margin: 10px 0;"><img src="${canvasDataUrl}" style="image-rendering: pixelated; border: 1px solid #666;"></div>`);
                    messages.push(`<span style="font-size: 12px; color: #999;">(녹색: 이미 찾은 영역, 회색: 이미지 밖, 나머지: 원본 픽셀)</span>`);
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
                
                // 정보 버튼 업데이트
                updateInfoButtons(finalStartPoint.x, finalStartPoint.y, maxSize);
                
                updateRegionsList();
            } else {
                messages.push('<br><strong>흰색 영역을 찾을 수 없습니다.</strong>');
            }

            showMessage(messages.join('<br>'), maxSize > 0 ? 'result' : 'error');
        }

        // 캔버스에 사각형 그리기
        function drawRectangle(x, y, size, color) {
            ctx.fillStyle = color;
            ctx.fillRect(x, y, size, size);
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
            clearInfoButtons();
            
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