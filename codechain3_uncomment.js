        (function() {
            // 모든 코드를 IIFE로 감싸서 변수 충돌 방지
            const inputTextarea = document.getElementById('input');
            const outputTextarea = document.getElementById('output');
            const removeBtn = document.getElementById('removeBtn');
            const clearBtn = document.getElementById('clearBtn');
            const copyBtn = document.getElementById('copyBtn');
            const statusDiv = document.getElementById('status');

            function showStatus(message, isError = false) {
                statusDiv.textContent = message;
                statusDiv.className = 'status ' + (isError ? 'error' : 'success');
                
                setTimeout(() => {
                    statusDiv.style.display = 'none';
                }, 3000);
            }

            function removeComments() {
                const sourceCode = inputTextarea.value.trim();
                
                if (!sourceCode) {
                    showStatus('입력된 코드가 없습니다.', true);
                    return;
                }

                try {
                    // Esprima로 코드 파싱 (위치 정보와 주석 포함)
                    const tokens = esprima.tokenize(sourceCode, { 
                        range: true,
                        comment: false  // 주석은 토큰에서 제외
                    });

                    // 토큰들을 다시 코드로 재구성
                    let result = '';
                    let lastEnd = 0;

                    tokens.forEach((token, index) => {
                        const [start, end] = token.range;
                        
                        // 토큰 사이의 공백 처리 (주석이 있던 자리는 공백으로)
                        if (start > lastEnd) {
                            const between = sourceCode.substring(lastEnd, start);
                            // 줄바꿈은 유지, 나머지 공백은 단일 공백으로
                            const whitespace = between.replace(/[^\n]/g, '').length > 0 ? 
                                between.replace(/[^\n]+/g, ' ') : ' ';
                            result += whitespace;
                        }
                        
                        // 실제 토큰 추가
                        result += sourceCode.substring(start, end);
                        lastEnd = end;
                    });

                    // 결과 정리 (연속된 빈 줄 제거)
                    result = result.replace(/\n\s*\n\s*\n/g, '\n\n').trim();

                    outputTextarea.value = result;
                    showStatus('✅ 주석이 성공적으로 제거되었습니다!');

                } catch (error) {
                    showStatus('❌ 파싱 오류: ' + error.message, true);
                    console.error('Error:', error);
                }
            }

            function clearAll() {
                inputTextarea.value = '';
                outputTextarea.value = '';
                statusDiv.style.display = 'none';
            }

            function copyOutput() {
                if (!outputTextarea.value) {
                    showStatus('복사할 내용이 없습니다.', true);
                    return;
                }

                outputTextarea.select();
                document.execCommand('copy');
                showStatus('📋 클립보드에 복사되었습니다!');
            }

            // 이벤트 리스너
            removeBtn.addEventListener('click', removeComments);
            clearBtn.addEventListener('click', clearAll);
            copyBtn.addEventListener('click', copyOutput);

            // Enter 키로도 실행 가능 (Ctrl+Enter)
            inputTextarea.addEventListener('keydown', (e) => {
                if (e.ctrlKey && e.key === 'Enter') {
                    removeComments();
                }
            });
        })();