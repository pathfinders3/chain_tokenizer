import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/**
 * Three.js 기반 저장된 그룹 데이터 렌더링
 * 
 * @param {Object} jsonData - '모든 그룹 저장'으로 저장한 JSON 데이터
 * @param {HTMLCanvasElement} canvas - 그릴 캔버스 엘리먼트
 * @param {Object} options - 옵션 설정 (선택사항)
 * @param {number} options.scalePercent - 스케일 비율 (기본값: 60)
 * @param {boolean} options.showPoints - 점 표시 여부 (기본값: true)
 * @param {boolean} options.showLines - 선 표시 여부 (기본값: true)
 * @param {number} options.pointSize - 점 크기 (기본값: 4)
 * @param {number} options.lineWidth - 선 두께 (기본값: 2)
 */

// 전역 변수
let scene, camera, renderer, controls;
let groupObjects = []; // Three.js 그룹 객체들
let currentJsonData = null;
let raycaster, mouse;
let selectedGroup = null;

function initThreeJS(canvas) {
    // Scene 생성
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);

    // Camera 생성 (PerspectiveCamera)
    const aspect = canvas.width / canvas.height;
    camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 10000);
    camera.position.z = 500;

    // Renderer 생성 (기존 캔버스 재사용)
    renderer = new THREE.WebGLRenderer({ 
        canvas: canvas,
        antialias: true 
    });
    renderer.setSize(canvas.width, canvas.height);

    // OrbitControls 추가 (마우스로 회전/확대/이동)
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // 부드러운 움직임
    controls.dampingFactor = 0.05;
    controls.screenSpacePanning = false;
    controls.minDistance = 50;
    controls.maxDistance = 2000;

    // 조명 추가 (선택사항)
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.4);
    directionalLight.position.set(0, 1, 1);
    scene.add(directionalLight);

    // Raycaster 초기화 (객체 선택용)
    raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 3; // 선 클릭 감지 범위 확대
    mouse = new THREE.Vector2();

    // 애니메이션 루프 시작
    animate();

    console.log('Three.js 초기화 완료');
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}

// 카메라를 초기 위치로 리셋
function resetCamera() {
    if (!camera || !controls) {
        console.warn('카메라가 초기화되지 않았습니다.');
        return;
    }
    
    // 카메라 위치 리셋 (정면 뷰)
    camera.position.set(0, 0, 500);
    camera.rotation.set(0, 0, 0);
    
    // OrbitControls 타겟 리셋 (원점)
    controls.target.set(0, 0, 0);
    controls.update();
    
    console.log('카메라 위치 리셋 완료');
}

// 선택된 그룹 하이라이트 업데이트
function updateSelection() {
    groupObjects.forEach(groupObj => {
        const isSelected = groupObj === selectedGroup;
        
        // 그룹 내 모든 객체 순회
        groupObj.children.forEach(child => {
            // 실제 데이터 라인만 처리 (점 테두리 제외)
            if (child.userData.isDataLine) {
                // 선택된 경우 노란색으로, 아니면 원래 색상으로
                if (isSelected) {
                    child.material.color.setHex(0xffff00); // 노란색
                    child.material.linewidth = 3;
                } else {
                    // 원래 색상으로 복원
                    if (groupObj.userData.originalColor) {
                        child.material.color.copy(groupObj.userData.originalColor);
                    }
                }
            } 
            // 실제 데이터 점만 처리
            else if (child.userData.isDataPoint) {
                // 점(Sphere)도 하이라이트
                if (isSelected) {
                    child.material.emissive = new THREE.Color(0xffff00);
                    child.material.emissiveIntensity = 0.5;
                } else {
                    child.material.emissive = new THREE.Color(0x000000);
                    child.material.emissiveIntensity = 0;
                }
            }
            // 점 테두리(edges)는 항상 흰색 유지
        });
    });
}

// 마우스 클릭으로 그룹 선택
function onCanvasClick(event, canvas) {
    // 캔버스 내 마우스 위치 계산 (정규화된 좌표: -1 ~ 1)
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    // Raycaster로 광선 쏘기
    raycaster.setFromCamera(mouse, camera);

    // 모든 그룹의 자식 객체들과 교차 검사
    const allObjects = [];
    groupObjects.forEach(group => {
        group.children.forEach(child => {
            allObjects.push(child);
        });
    });

    const intersects = raycaster.intersectObjects(allObjects, false);

    if (intersects.length > 0) {
        // 클릭된 객체의 부모 그룹 찾기
        const clickedObject = intersects[0].object;
        const clickedGroup = groupObjects.find(group => 
            group.children.includes(clickedObject)
        );

        if (clickedGroup) {
            // 같은 그룹을 다시 클릭하면 선택 해제
            if (selectedGroup === clickedGroup) {
                selectedGroup = null;
                console.log('선택 해제');
            } else {
                selectedGroup = clickedGroup;
                console.log('그룹 선택:', clickedGroup.userData.groupIndex);
            }
            updateSelection();
        }
    } else {
        // 빈 공간 클릭 시 선택 해제
        if (selectedGroup) {
            selectedGroup = null;
            console.log('선택 해제');
            updateSelection();
        }
    }
}

function renderSavedGroups(jsonData, canvas, options = {}) {
    // 기본 옵션 설정
    const config = {
        scalePercent: options.scalePercent ?? 60,
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

    // Three.js 초기화 (최초 1회만)
    if (!renderer) {
        initThreeJS(canvas);
    }

    currentJsonData = jsonData;
    const groups = jsonData.groups;

    console.log('=== Three.js 렌더링 시작 ===');
    console.log('그룹 수:', groups.length);
    console.log('옵션:', config);

    // 기존 그룹 객체들 제거
    groupObjects.forEach(group => {
        scene.remove(group);
    });
    groupObjects = [];

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

    const scale = config.scalePercent / 100;

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

        // Three.js Group 생성
        const groupObject = new THREE.Group();
        
        // 그룹 메타데이터 저장
        groupObject.userData.groupIndex = groupIndex;
        groupObject.userData.originalColor = new THREE.Color(color);
        groupObject.userData.color = color;

        // 3D 좌표 변환 (중심을 원점으로)
        const vertices = points.map(p => 
            new THREE.Vector3(
                (p.x - dataCenterX) * scale,
                (p.y - dataCenterY) * scale,
                0
            )
        );

        // 선 그리기
        if (config.showLines && points.length > 1) {
            const lineGeometry = new THREE.BufferGeometry().setFromPoints(vertices);
            const lineMaterial = new THREE.LineBasicMaterial({ 
                color: new THREE.Color(color),
                linewidth: config.lineWidth // WebGL에서는 대부분 1로 제한됨
            });
            const line = new THREE.Line(lineGeometry, lineMaterial);
            line.userData.isDataLine = true; // 실제 데이터 라인 표시
            groupObject.add(line);
        }

        // 점 그리기
        if (config.showPoints) {
            vertices.forEach(vertex => {
                const sphereGeometry = new THREE.SphereGeometry(config.pointSize, 16, 16);
                const sphereMaterial = new THREE.MeshStandardMaterial({ 
                    color: new THREE.Color(color),
                    emissive: new THREE.Color(0x000000),
                    emissiveIntensity: 0,
                    metalness: 0.3,
                    roughness: 0.7
                });
                const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
                sphere.position.copy(vertex);
                sphere.userData.isDataPoint = true; // 실제 데이터 점 표시
                groupObject.add(sphere);

                // 흰색 테두리 (선택사항)
                const edgesGeometry = new THREE.EdgesGeometry(sphereGeometry);
                const edgesMaterial = new THREE.LineBasicMaterial({ color: 0xffffff });
                const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
                edges.position.copy(vertex);
                edges.userData.isEdge = true; // 테두리 표시
                groupObject.add(edges);
            });
        }

        scene.add(groupObject);
        groupObjects.push(groupObject);
    });

    console.log('=== Three.js 렌더링 완료 ===');
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

// DOM이 로드된 후 실행
document.addEventListener('DOMContentLoaded', () => {
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

    // 캔버스 클릭 이벤트 (그룹 선택)
    canvas.addEventListener('click', (event) => {
        onCanvasClick(event, canvas);
    });

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

    // 카메라 리셋
    document.getElementById('resetCameraBtn').addEventListener('click', () => {
        resetCamera();
    });

    // 캔버스 지우기
    document.getElementById('clearBtn').addEventListener('click', () => {
        // Three.js 씬에서 모든 그룹 제거
        groupObjects.forEach(group => {
            scene.remove(group);
        });
        groupObjects = [];
        console.log('캔버스 지우기 완료');
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