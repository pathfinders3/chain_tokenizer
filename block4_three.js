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
let selectedPoint = null; // 선택된 점 객체
let selectedPointIndex = null; // 선택된 점의 인덱스
let gridHelper = null; // 격자 객체
let highlightedLines = []; // 강조된 격자선들 (배열)
let gridPlane = null; // 현재 격자 평면 (교차 계산용)
let selectedGroupData = null; // 선택된 그룹의 원본 데이터
let rotationMode = 'horizontal'; // 회전 모드: 'horizontal' (좌우) 또는 'vertical' (위아래)
let savedPolarAngle = null; // 저장된 수직 각도
let savedAzimuthAngle = null; // 저장된 수평 각도

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
    
    // 회전 모드에 따라 각도 제한
    applyRotationConstraints();
    
    renderer.render(scene, camera);
    
    // 카메라 거리 UI 업데이트
    updateCameraDistanceDisplay();
}

// 회전 자취 생성 함수
function createRotationTrace(tStart, tEnd, tStep, rotationAxis, axisInputValues, isRelativeMode, ellipseMode, radiusX, radiusZ) {
    if (!selectedPoint || selectedPointIndex === null || !selectedGroupData) {
        alert('먼저 점을 선택해주세요!');
        return;
    }

    // 선택된 점의 원본 좌표
    const originalPoint = selectedGroupData.points[selectedPointIndex];
    
    // 모드에 따라 절대 좌표 계산
    let axisPosition;
    let distanceFromPoint;
    
    if (isRelativeMode) {
        // 상대 모드: 선택된 점 + 입력값
        axisPosition = {
            x: (originalPoint.x || 0) + axisInputValues.x,
            y: (originalPoint.y || 0) + axisInputValues.y,
            z: (originalPoint.z || 0) + axisInputValues.z
        };
        // 거리는 상대 좌표 자체
        distanceFromPoint = Math.sqrt(
            axisInputValues.x * axisInputValues.x + 
            axisInputValues.y * axisInputValues.y + 
            axisInputValues.z * axisInputValues.z
        );
    } else {
        // 절대 모드: 입력값 그대로 사용
        axisPosition = axisInputValues;
        // 거리는 선택된 점에서 축 위치까지
        const dx = (originalPoint.x || 0) - axisPosition.x;
        const dy = (originalPoint.y || 0) - axisPosition.y;
        const dz = (originalPoint.z || 0) - axisPosition.z;
        distanceFromPoint = Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    
    if (distanceFromPoint >= 100) {
        alert(`경고: 회전축이 선택된 점으로부터 ${distanceFromPoint.toFixed(1)} 떨어져 있습니다. (100 이상)`);
        return; // 자취 생성 중단
    }
    
    // 데이터 중심 계산 (현재 렌더링과 동일하게)
    const groups = currentJsonData.groups;
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
    const dataCenterX = (minX + maxX) / 2;
    const dataCenterY = (minY + maxY) / 2;

    // 회전 자취 점들 생성
    const tracePoints = [];
    
    for (let t = tStart; t <= tEnd; t += tStep) {
        let rotatedPoint;
        
        if (rotationAxis === 'Y') {
            // Y축 중심 회전 (좌우) - XZ 평면
            if (ellipseMode) {
                // 타원 모드: 절대 길이 사용
                const rotatedX = radiusX * Math.cos(t) + axisPosition.x;
                const rotatedZ = radiusZ * Math.sin(t) + axisPosition.z;
                rotatedPoint = {
                    x: rotatedX,
                    y: originalPoint.y,
                    z: rotatedZ
                };
            } else {
                // 원형 모드
                const dx = originalPoint.x - axisPosition.x;
                const dz = (originalPoint.z || 0) - axisPosition.z;
                const rotatedX = dx * Math.cos(t) - dz * Math.sin(t) + axisPosition.x;
                const rotatedZ = dx * Math.sin(t) + dz * Math.cos(t) + axisPosition.z;
                rotatedPoint = {
                    x: rotatedX,
                    y: originalPoint.y,
                    z: rotatedZ
                };
            }
        } else if (rotationAxis === 'X') {
            // X축 중심 회전 (전후)
            const dy = originalPoint.y - axisPosition.y;
            const dz = (originalPoint.z || 0) - axisPosition.z;
            const rotatedY = dy * Math.cos(t) - dz * Math.sin(t) + axisPosition.y;
            const rotatedZ = dy * Math.sin(t) + dz * Math.cos(t) + axisPosition.z;
            rotatedPoint = {
                x: originalPoint.x,
                y: rotatedY,
                z: rotatedZ
            };
        } else if (rotationAxis === 'Z') {
            // Z축 중심 회전 (상하)
            const dx = originalPoint.x - axisPosition.x;
            const dy = originalPoint.y - axisPosition.y;
            const rotatedX = dx * Math.cos(t) - dy * Math.sin(t) + axisPosition.x;
            const rotatedY = dx * Math.sin(t) + dy * Math.cos(t) + axisPosition.y;
            rotatedPoint = {
                x: rotatedX,
                y: rotatedY,
                z: originalPoint.z || 0
            };
        }
        
        tracePoints.push(rotatedPoint);
    }

    // 반지름 계산
    const dx = originalPoint.x - axisPosition.x;
    const dy = originalPoint.y - axisPosition.y;
    const dz = (originalPoint.z || 0) - axisPosition.z;
    const radius = Math.sqrt(dx * dx + dy * dy + dz * dz);
    
    console.log(`회전 자취 생성: ${tracePoints.length}개 점, 축: ${rotationAxis}, t: ${tStart} ~ ${tEnd}, step: ${tStep}`);
    console.log('축 위치 (중심):', axisPosition);
    
    if (ellipseMode) {
        const majorAxis = Math.max(radiusX, radiusZ);
        const minorAxis = Math.min(radiusX, radiusZ);
        const eccentricity = minorAxis > 0 ? Math.sqrt(1 - (minorAxis * minorAxis) / (majorAxis * majorAxis)) : 0;
        console.log('타원 모드 - XZ 평면');
        console.log(`  X방향 반지름: ${radiusX.toFixed(3)}`);
        console.log(`  Z방향 반지름: ${radiusZ.toFixed(3)}`);
        console.log(`  장축: ${majorAxis.toFixed(3)}, 단축: ${minorAxis.toFixed(3)}`);
        console.log(`  이심률: ${eccentricity.toFixed(4)}`);
    } else {
        const dx = originalPoint.x - axisPosition.x;
        const dy = originalPoint.y - axisPosition.y;
        const dz = (originalPoint.z || 0) - axisPosition.z;
        const radius = Math.sqrt(dx * dx + dy * dy + dz * dz);
        console.log('원형 모드');
        console.log('반지름:', radius.toFixed(3));
        console.log('원본 점:', originalPoint);
    }
    
    console.log('생성된 첫 점:', tracePoints[0]);
    console.log('생성된 마지막 점:', tracePoints[tracePoints.length - 1]);

    // 새 그룹 생성 (z 좌표 포함)
    const newGroup = {
        color: '#f093fb', // 분홍색으로 구분
        points: tracePoints, // z 좌표를 포함한 전체 점 저장
        visible: true,
        metadata: {
            type: 'rotation_trace',
            originalPoint: originalPoint,
            tStart: tStart,
            tEnd: tEnd,
            tStep: tStep
        }
    };

    // JSON 데이터에 추가
    currentJsonData.groups.push(newGroup);
    
    // 텍스트 입력창도 업데이트 (자취가 저장되도록)
    const jsonInput = document.getElementById('jsonInput');
    if (jsonInput) {
        jsonInput.value = JSON.stringify(currentJsonData, null, 2);
    }
    
    // 자동 재렌더링
    const canvas = document.getElementById('canvas');
    const scaleSlider = document.getElementById('scaleSlider');
    const pointSizeSlider = document.getElementById('pointSizeSlider');
    const lineWidthSlider = document.getElementById('lineWidthSlider');
    
    renderSavedGroups(currentJsonData, canvas, {
        scalePercent: parseInt(scaleSlider.value),
        pointSize: parseInt(pointSizeSlider.value),
        lineWidth: parseInt(lineWidthSlider.value)
    });
}

// 원 그리기 함수 (두 점으로 원 생성)
function createCircle(pointB, centerA) {
    // centerA의 y 좌표를 pointB의 y로 강제 조정
    const adjustedCenterA = {
        x: centerA.x,
        y: pointB.y,
        z: centerA.z
    };
    
    // 반지름 계산 (XZ 평면에서의 거리)
    const dx = pointB.x - adjustedCenterA.x;
    const dz = (pointB.z || 0) - adjustedCenterA.z;
    const radius = Math.sqrt(dx * dx + dz * dz);
    
    if (radius < 0.1) {
        alert('중심점과 원 위의 점이 너무 가깝습니다. (반지름 < 0.1)');
        return;
    }
    
    console.log('원 생성:', {
        pointB: pointB,
        centerA: adjustedCenterA,
        radius: radius
    });
    
    // t 범위 가져오기
    const tStart = parseFloat(document.getElementById('tStartInput').value) || 0;
    const tEnd = parseFloat(document.getElementById('tEndInput').value) || 6.28;
    const tStep = parseFloat(document.getElementById('tStepInput').value) || 0.3;
    
    // pointB의 초기 각도 계산 (중심에서 pointB로의 벡터 각도)
    const initialAngle = Math.atan2(dz, dx);
    
    // 원 위의 점들 생성
    const circlePoints = [];
    for (let t = tStart; t <= tEnd; t += tStep) {
        const angle = initialAngle + t;
        const x = adjustedCenterA.x + radius * Math.cos(angle);
        const y = adjustedCenterA.y;
        const z = adjustedCenterA.z + radius * Math.sin(angle);
        circlePoints.push({ x, y, z });
    }
    
    // 새 그룹 생성
    const newGroup = {
        color: '#00ff00', // 녹색으로 구분
        points: circlePoints,
        visible: true,
        metadata: {
            type: 'circle',
            center: adjustedCenterA,
            radius: radius,
            pointB: pointB
        }
    };
    
    // JSON 데이터에 추가
    currentJsonData.groups.push(newGroup);
    
    // 텍스트 입력창도 업데이트 (원이 저장되도록)
    const jsonInput = document.getElementById('jsonInput');
    if (jsonInput) {
        jsonInput.value = JSON.stringify(currentJsonData, null, 2);
    }
    
    // 자동 재렌더링
    const canvas = document.getElementById('canvas');
    const scaleSlider = document.getElementById('scaleSlider');
    const pointSizeSlider = document.getElementById('pointSizeSlider');
    const lineWidthSlider = document.getElementById('lineWidthSlider');
    
    renderSavedGroups(currentJsonData, canvas, {
        scalePercent: parseInt(scaleSlider.value),
        pointSize: parseInt(pointSizeSlider.value),
        lineWidth: parseInt(lineWidthSlider.value)
    });
    
    console.log(`원 생성 완료! (${circlePoints.length}개 점, 반지름: ${radius.toFixed(2)})`);
}

// 회전 제약 적용
function applyRotationConstraints() {
    if (!controls) return;
    
    if (rotationMode === 'horizontal') {
        // 좌우 회전 모드: 수직 각도(Polar) 고정
        if (savedPolarAngle !== null) {
            const currentPolar = controls.getPolarAngle();
            if (Math.abs(currentPolar - savedPolarAngle) > 0.01) {
                controls.minPolarAngle = savedPolarAngle;
                controls.maxPolarAngle = savedPolarAngle;
            }
        }
    } else if (rotationMode === 'vertical') {
        // 위아래 회전 모드: 수평 각도(Azimuth) 고정
        if (savedAzimuthAngle !== null) {
            const currentAzimuth = controls.getAzimuthalAngle();
            if (Math.abs(currentAzimuth - savedAzimuthAngle) > 0.01) {
                controls.minAzimuthAngle = savedAzimuthAngle;
                controls.maxAzimuthAngle = savedAzimuthAngle;
            }
        }
    }
}

// 회전 모드 설정
function setRotationMode(mode) {
    if (!controls) return;
    
    rotationMode = mode;
    
    if (mode === 'horizontal') {
        // 좌우 회전 모드: 수평(Azimuth)은 자유, 수직(Polar)은 현재 각도로 고정
        savedPolarAngle = controls.getPolarAngle();
        controls.minPolarAngle = savedPolarAngle;
        controls.maxPolarAngle = savedPolarAngle;
        controls.minAzimuthAngle = -Infinity;
        controls.maxAzimuthAngle = Infinity;
        console.log('회전 모드: 좌우 회전 (수직 각도 고정:', savedPolarAngle, ')');
    } else if (mode === 'vertical') {
        // 위아래 회전 모드: 수직(Polar)은 자유, 수평(Azimuth)은 현재 각도로 고정
        savedAzimuthAngle = controls.getAzimuthalAngle();
        controls.minAzimuthAngle = savedAzimuthAngle;
        controls.maxAzimuthAngle = savedAzimuthAngle;
        controls.minPolarAngle = 0;
        controls.maxPolarAngle = Math.PI;
        console.log('회전 모드: 위아래 회전 (수평 각도 고정:', savedAzimuthAngle, ')');
    }
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

// 정면 뷰 (XY 평면) - Z축에서 바라봄
function setCameraViewXY() {
    if (!camera || !controls) {
        console.warn('카메라가 초기화되지 않았습니다.');
        return;
    }
    
    // 회전 제약 해제
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    savedPolarAngle = null;
    savedAzimuthAngle = null;
    
    camera.position.set(0, 0, 500);
    controls.target.set(0, 0, 0);
    controls.update();
    
    console.log('정면 뷰 (XY) 설정');
}

// 위 뷰 (XZ 평면) - Y축 위에서 아래로 바라봄
function setCameraViewXZ() {
    if (!camera || !controls) {
        console.warn('카메라가 초기화되지 않았습니다.');
        return;
    }
    
    // 회전 제약 해제
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    savedPolarAngle = null;
    savedAzimuthAngle = null;
    
    camera.position.set(0, 500, 0);
    controls.target.set(0, 0, 0);
    controls.update();
    
    console.log('위 뷰 (XZ) 설정');
}

// 측면 뷰 (YZ 평면) - X축 옆에서 바라봄
function setCameraViewYZ() {
    if (!camera || !controls) {
        console.warn('카메라가 초기화되지 않았습니다.');
        return;
    }
    
    // 회전 제약 해제
    controls.minPolarAngle = 0;
    controls.maxPolarAngle = Math.PI;
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    savedPolarAngle = null;
    savedAzimuthAngle = null;
    
    camera.position.set(500, 0, 0);
    controls.target.set(0, 0, 0);
    controls.update();
    
    console.log('측면 뷰 (YZ) 설정');
}

// 선택된 점의 좌표 표시 업데이트
function updateSelectedPointDisplay() {
    const selectedPointCoordsSpan = document.getElementById('selectedPointCoords');
    if (!selectedPointCoordsSpan) return;
    
    if (selectedPoint && selectedPointIndex !== null && selectedGroupData) {
        const point = selectedGroupData.points[selectedPointIndex];
        const x = point.x.toFixed(1);
        const y = point.y.toFixed(1);
        const z = (point.z || 0).toFixed(1);
        selectedPointCoordsSpan.textContent = `(${x}, ${y}, ${z})`;
    } else {
        selectedPointCoordsSpan.textContent = '-';
    }
}

// 선택된 자취 삭제 함수
function deleteSelectedTrace() {
    if (!selectedGroupData || !currentJsonData) {
        alert('먼저 자취 상의 점을 선택해주세요!');
        return;
    }
    
    // 선택된 그룹이 자취인지 확인
    if (!selectedGroupData.metadata || selectedGroupData.metadata.type !== 'rotation_trace') {
        alert('선택된 점이 자취 그룹에 속하지 않습니다.');
        return;
    }
    
    // 삭제 확인
    const confirmDelete = confirm(`자취를 삭제하시겠습니까?\n(점 개수: ${selectedGroupData.points.length}개)`);
    if (!confirmDelete) return;
    
    // currentJsonData에서 해당 그룹 찾아서 삭제
    const groupIndex = currentJsonData.groups.indexOf(selectedGroupData);
    if (groupIndex !== -1) {
        currentJsonData.groups.splice(groupIndex, 1);
        console.log(`자취 삭제 완료 (인덱스: ${groupIndex})`);
        
        // 텍스트 입력창도 업데이트
        const jsonInput = document.getElementById('jsonInput');
        if (jsonInput) {
            jsonInput.value = JSON.stringify(currentJsonData, null, 2);
        }
        
        // 선택 해제
        selectedGroup = null;
        selectedPoint = null;
        selectedPointIndex = null;
        selectedGroupData = null;
        
        // 재렌더링
        const canvas = document.getElementById('canvas');
        const scaleSlider = document.getElementById('scaleSlider');
        const pointSizeSlider = document.getElementById('pointSizeSlider');
        const lineWidthSlider = document.getElementById('lineWidthSlider');
        const showPointsCheck = document.getElementById('showPointsCheck');
        const showLinesCheck = document.getElementById('showLinesCheck');
        
        renderSavedGroups(currentJsonData, canvas, {
            scalePercent: parseInt(scaleSlider.value),
            pointSize: parseInt(pointSizeSlider.value),
            lineWidth: parseInt(lineWidthSlider.value),
            showPoints: showPointsCheck.checked,
            showLines: showLinesCheck.checked
        });
        
        updateSelectedPointDisplay();
        updateNextPointDistance();
    } else {
        alert('자취를 찾을 수 없습니다.');
    }
}

// 카메라 거리 표시 업데이트
function updateCameraDistanceDisplay() {
    if (!camera) return;
    
    const distanceElement = document.getElementById('cameraDistanceValue');
    if (distanceElement) {
        const distance = camera.position.length();
        distanceElement.textContent = Math.round(distance);
    }
}

// 다음 점까지의 거리 UI 업데이트
function updateNextPointDistance() {
    const distanceElement = document.getElementById('nextPointDistanceValue');
    if (!distanceElement) return;

    // 점이 선택되지 않았거나, 그룹 데이터가 없으면 - 표시
    if (!selectedPoint || selectedPointIndex === null || !selectedGroupData) {
        distanceElement.textContent = '-';
        return;
    }

    const points = selectedGroupData.points;
    if (!points || selectedPointIndex >= points.length - 1) {
        // 마지막 점이거나 유효하지 않은 경우
        distanceElement.textContent = '다음점없음';
        return;
    }

    // 현재 점과 다음 점 가져오기
    const currentPoint = points[selectedPointIndex];
    const nextPoint = points[selectedPointIndex + 1];

    // 거리 계산 (유클리드 거리)
    const dx = nextPoint.x - currentPoint.x;
    const dy = nextPoint.y - currentPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // 소수점 2자리까지 표시
    distanceElement.textContent = distance.toFixed(2);
}

// 격자 생성/업데이트
function updateGrid(show, plane, size, spacing) {
    // 기존 격자 제거
    if (gridHelper) {
        scene.remove(gridHelper);
        gridHelper = null;
    }

    if (!show) {
        gridPlane = null;
        return;
    }

    gridPlane = plane; // 현재 평면 저장
    
    // spacing을 실제 간격으로 사용, divisions 계산
    const divisions = Math.floor(size / spacing);
    
    // GridHelper 생성 (XZ 평면 기본)
    gridHelper = new THREE.GridHelper(size, divisions, 0x444444, 0x222222);
    
    // 평면에 따라 회전
    if (plane === 'XY') {
        // XY 평면 (Z축 기준 90도 회전)
        gridHelper.rotation.x = Math.PI / 2;
    } else if (plane === 'YZ') {
        // YZ 평면 (Z축 기준 90도 회전)
        gridHelper.rotation.z = Math.PI / 2;
    }
    // XZ는 기본값이므로 회전 불필요

    scene.add(gridHelper);
    console.log(`격자 표시: ${plane} 평면, 크기: ${size}, 간격: ${spacing}, 분할수: ${divisions}`);
}

// 격자선 강조 추가 (고정)
function addHighlightedGridLine(event, canvas, gridSize, gridSpacing, axis) {
    if (!gridPlane) return;

    // 마우스 위치 계산
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);

    // 격자 평면과의 교차점 찾기
    let planeNormal, planePoint;
    if (gridPlane === 'XY') {
        planeNormal = new THREE.Vector3(0, 0, 1);
        planePoint = new THREE.Vector3(0, 0, 0);
    } else if (gridPlane === 'XZ') {
        planeNormal = new THREE.Vector3(0, 1, 0);
        planePoint = new THREE.Vector3(0, 0, 0);
    } else { // YZ
        planeNormal = new THREE.Vector3(1, 0, 0);
        planePoint = new THREE.Vector3(0, 0, 0);
    }

    const plane = new THREE.Plane(planeNormal, 0);
    const intersectPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(plane, intersectPoint);

    if (!intersectPoint) return;

    // 가장 가까운 격자선 좌표 계산
    let lineStart, lineEnd;
    const halfSize = gridSize / 2;

    if (gridPlane === 'XY') {
        if (axis === 'X') {
            // X 방향 (수평선)
            const nearestY = Math.round(intersectPoint.y / gridSpacing) * gridSpacing;
            lineStart = new THREE.Vector3(-halfSize, nearestY, 0);
            lineEnd = new THREE.Vector3(halfSize, nearestY, 0);
        } else if (axis === 'Y') {
            // Y 방향 (수직선)
            const nearestX = Math.round(intersectPoint.x / gridSpacing) * gridSpacing;
            lineStart = new THREE.Vector3(nearestX, -halfSize, 0);
            lineEnd = new THREE.Vector3(nearestX, halfSize, 0);
        }
    } else if (gridPlane === 'XZ') {
        if (axis === 'X') {
            // X 방향
            const nearestZ = Math.round(intersectPoint.z / gridSpacing) * gridSpacing;
            lineStart = new THREE.Vector3(-halfSize, 0, nearestZ);
            lineEnd = new THREE.Vector3(halfSize, 0, nearestZ);
        } else if (axis === 'Y') {
            // Z 방향 (XZ 평면에서 Y는 Z축)
            const nearestX = Math.round(intersectPoint.x / gridSpacing) * gridSpacing;
            lineStart = new THREE.Vector3(nearestX, 0, -halfSize);
            lineEnd = new THREE.Vector3(nearestX, 0, halfSize);
        }
    } else { // YZ
        if (axis === 'X') {
            // Y 방향 (YZ 평면에서 X는 Y축)
            const nearestZ = Math.round(intersectPoint.z / gridSpacing) * gridSpacing;
            lineStart = new THREE.Vector3(0, -halfSize, nearestZ);
            lineEnd = new THREE.Vector3(0, halfSize, nearestZ);
        } else if (axis === 'Y') {
            // Z 방향
            const nearestY = Math.round(intersectPoint.y / gridSpacing) * gridSpacing;
            lineStart = new THREE.Vector3(0, nearestY, -halfSize);
            lineEnd = new THREE.Vector3(0, nearestY, halfSize);
        }
    }

    // 강조선 그리기
    if (lineStart && lineEnd) {
        const geometry = new THREE.BufferGeometry().setFromPoints([lineStart, lineEnd]);
        const material = new THREE.LineBasicMaterial({ 
            color: axis === 'X' ? 0xff0000 : 0x00ff00,
            linewidth: 3
        });
        const line = new THREE.Line(geometry, material);
        scene.add(line);
        highlightedLines.push(line);
        console.log(`격자선 추가: ${axis}축 방향, 총 ${highlightedLines.length}개`);
    }
}

// 모든 강조된 격자선 제거
function clearAllHighlightedLines() {
    highlightedLines.forEach(line => {
        scene.remove(line);
    });
    highlightedLines = [];
    console.log('모든 강조된 격자선 제거');
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
                // 선택된 점인지 확인
                const isSelectedPoint = (selectedPoint === child);
                
                // 점(Sphere)도 하이라이트
                if (isSelected) {
                    if (isSelectedPoint) {
                        // 클릭한 점은 빨간색으로 강조 + 크기 확대
                        child.material.color.setHex(0xff0000);
                        child.material.emissive = new THREE.Color(0xff0000);
                        child.material.emissiveIntensity = 1.0;
                        child.scale.set(1.5, 1.5, 1.5); // 1.5배 확대
                    } else {
                        // 같은 그룹의 다른 점들은 노란색으로
                        child.material.emissive = new THREE.Color(0xffff00);
                        child.material.emissiveIntensity = 0.5;
                        child.scale.set(1, 1, 1); // 원래 크기
                    }
                } else {
                    child.material.emissive = new THREE.Color(0x000000);
                    child.material.emissiveIntensity = 0;
                    child.scale.set(1, 1, 1); // 원래 크기
                    // 원래 색상 복원
                    if (groupObj.userData.originalColor) {
                        child.material.color.copy(groupObj.userData.originalColor);
                    }
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

    // 모든 그룹의 자식 객체들과 교차 검사 (테두리는 제외)
    const allObjects = [];
    groupObjects.forEach(group => {
        group.children.forEach(child => {
            // 테두리(edges)는 클릭 감지에서 제외
            if (!child.userData.isEdge) {
                allObjects.push(child);
            }
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
            if (selectedGroup === clickedGroup && selectedPoint === clickedObject) {
                selectedGroup = null;
                selectedPoint = null;
                selectedPointIndex = null;
                selectedGroupData = null;
                console.log('선택 해제');
                updateSelectedPointDisplay();
            } else {
                selectedGroup = clickedGroup;
                
                // 점을 클릭했는지 확인
                if (clickedObject.userData.isDataPoint) {
                    selectedPoint = clickedObject;
                    // 점의 인덱스 찾기
                    const pointObjects = clickedGroup.children.filter(child => child.userData.isDataPoint);
                    selectedPointIndex = pointObjects.indexOf(clickedObject);
                    // 선택된 그룹의 원본 데이터 저장
                    if (currentJsonData && currentJsonData.groups) {
                        selectedGroupData = currentJsonData.groups[clickedGroup.userData.groupIndex];
                    }
                    console.log('그룹 및 점 선택:', clickedGroup.userData.groupIndex, '점 인덱스:', selectedPointIndex);
                    
                    // 선택된 점의 좌표 표시
                    updateSelectedPointDisplay();
                } else {
                    // 선을 클릭한 경우
                    selectedPoint = null;
                    selectedPointIndex = null;
                    selectedGroupData = null;
                    updateSelectedPointDisplay();
                    console.log('그룹 선택:', clickedGroup.userData.groupIndex);
                }
            }
            updateSelection();
            updateNextPointDistance();
        }
    } else {
        // 빈 공간 클릭 시 선택 해제
        if (selectedGroup) {
            selectedGroup = null;
            selectedPoint = null;
            selectedPointIndex = null;
            selectedGroupData = null;
            console.log('선택 해제');
            updateSelection();
            updateNextPointDistance();
            updateSelectedPointDisplay();
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

        // 3D 좌표 변환 (중심을 원점으로, z 좌표가 있으면 사용)
        const vertices = points.map(p => 
            new THREE.Vector3(
                (p.x - dataCenterX) * scale,
                (p.y - dataCenterY) * scale,
                (p.z || 0) * scale  // z 좌표가 있으면 사용, 없으면 0
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
            vertices.forEach((vertex, vertexIndex) => {
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
                sphere.userData.pointIndex = vertexIndex; // 점의 인덱스 저장
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

    // 키보드 이벤트 (격자선 강조 추가)
    let lastMouseEvent = null;
    canvas.addEventListener('mousemove', (event) => {
        lastMouseEvent = event; // 마지막 마우스 위치 저장
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'F7' && lastMouseEvent) {
            event.preventDefault();
            const gridSizeValue = parseInt(document.getElementById('gridSizeSlider').value);
            const gridSpacingValue = parseInt(document.getElementById('gridDivisionsSlider').value);
            addHighlightedGridLine(lastMouseEvent, canvas, gridSizeValue, gridSpacingValue, 'X');
        } else if (event.key === 'F8' && lastMouseEvent) {
            event.preventDefault();
            const gridSizeValue = parseInt(document.getElementById('gridSizeSlider').value);
            const gridSpacingValue = parseInt(document.getElementById('gridDivisionsSlider').value);
            addHighlightedGridLine(lastMouseEvent, canvas, gridSizeValue, gridSpacingValue, 'Y');
        }
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
        // currentJsonData가 있으면 그것을 사용 (자취 포함)
        // 없으면 jsonInput에서 파싱
        let jsonData;
        if (currentJsonData) {
            jsonData = currentJsonData;
        } else if (jsonInput.value.trim()) {
            try {
                jsonData = JSON.parse(jsonInput.value);
            } catch (err) {
                console.error('JSON 파싱 오류:', err);
                return;
            }
        } else {
            return;
        }
        
        const options = {
            scalePercent: parseInt(scaleSlider.value),
            pointSize: parseInt(pointSizeSlider.value),
            lineWidth: parseInt(lineWidthSlider.value),
            showPoints: showPointsCheck.checked,
            showLines: showLinesCheck.checked
        };
        renderSavedGroups(jsonData, canvas, options);
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

    // 격자 컨트롤
    const showGridCheck = document.getElementById('showGridCheck');
    const gridPlaneSelect = document.getElementById('gridPlaneSelect');
    const gridSizeSlider = document.getElementById('gridSizeSlider');
    const gridSizeValue = document.getElementById('gridSizeValue');
    const gridDivisionsSlider = document.getElementById('gridDivisionsSlider');
    const gridDivisionsValue = document.getElementById('gridDivisionsValue');

    function updateGridFromUI() {
        updateGrid(
            showGridCheck.checked,
            gridPlaneSelect.value,
            parseInt(gridSizeSlider.value),
            parseInt(gridDivisionsSlider.value)
        );
    }

    showGridCheck.addEventListener('change', updateGridFromUI);
    gridPlaneSelect.addEventListener('change', updateGridFromUI);
    
    gridSizeSlider.addEventListener('input', (e) => {
        gridSizeValue.textContent = e.target.value;
        updateGridFromUI();
    });
    
    gridDivisionsSlider.addEventListener('input', (e) => {
        gridDivisionsValue.textContent = e.target.value;
        updateGridFromUI();
    });

    // 강조된 격자선 모두 지우기 버튼
    document.getElementById('clearHighlightedLinesBtn').addEventListener('click', () => {
        clearAllHighlightedLines();
    });

    // Textarea 토글
    document.getElementById('toggleTextareaBtn').addEventListener('click', () => {
        const textarea = document.getElementById('jsonInput');
        if (textarea.style.display === 'none') {
            textarea.style.display = 'block';
        } else {
            textarea.style.display = 'none';
        }
    });

    // 좌표 모드 변경 시 레이블 업데이트
    function updateCoordModeLabels() {
        const isRelative = document.getElementById('relativeModeRadio').checked;
        document.getElementById('axisXLabel').textContent = isRelative ? 'dx=' : 'x=';
        document.getElementById('axisYLabel').textContent = isRelative ? 'dy=' : 'y=';
        document.getElementById('axisZLabel').textContent = isRelative ? 'dz=' : 'z=';
    }

    document.getElementById('relativeModeRadio').addEventListener('change', updateCoordModeLabels);
    document.getElementById('absoluteModeRadio').addEventListener('change', updateCoordModeLabels);

    // 선택된 점의 좌표를 축 위치로 복사
    document.getElementById('copyToAxisBtn').addEventListener('click', () => {
        if (!selectedPoint || selectedPointIndex === null || !selectedGroupData) {
            alert('먼저 점을 선택해주세요!');
            return;
        }
        
        const isRelative = document.getElementById('relativeModeRadio').checked;
        const point = selectedGroupData.points[selectedPointIndex];
        
        if (isRelative) {
            // 상대 모드: 0,0,0으로 초기화 (선택된 점 위치가 기준)
            document.getElementById('axisXInput').value = '0';
            document.getElementById('axisYInput').value = '0';
            document.getElementById('axisZInput').value = '0';
        } else {
            // 절대 모드: 선택된 점의 절대 좌표
            document.getElementById('axisXInput').value = point.x.toFixed(1);
            document.getElementById('axisYInput').value = point.y.toFixed(1);
            document.getElementById('axisZInput').value = (point.z || 0).toFixed(1);
        }
    });

    // 회전 자취 생성 버튼
    document.getElementById('createRotationTraceBtn').addEventListener('click', () => {
        const tStart = parseFloat(document.getElementById('tStartInput').value);
        const tEnd = parseFloat(document.getElementById('tEndInput').value);
        const tStep = parseFloat(document.getElementById('tStepInput').value);
        const rotationAxis = document.getElementById('rotationAxisSelect').value;
        const axisX = parseFloat(document.getElementById('axisXInput').value);
        const axisY = parseFloat(document.getElementById('axisYInput').value);
        const axisZ = parseFloat(document.getElementById('axisZInput').value);
        const isRelative = document.getElementById('relativeModeRadio').checked;
        
        if (isNaN(tStart) || isNaN(tEnd) || isNaN(tStep)) {
            alert('유효한 숫자를 입력해주세요.');
            return;
        }
        
        if (isNaN(axisX) || isNaN(axisY) || isNaN(axisZ)) {
            alert('축 위치에 유효한 숫자를 입력해주세요.');
            return;
        }
        
        if (tStep <= 0) {
            alert('간격은 0보다 커야 합니다.');
            return;
        }
        
        if (tStart >= tEnd) {
            alert('시작값은 끝값보다 작아야 합니다.');
            return;
        }
        
        // 타원 모드 파라미터
        const ellipseMode = document.getElementById('ellipseModeCheck').checked;
        const radiusX = ellipseMode ? parseFloat(document.getElementById('ellipseRadiusXInput').value) : 0;
        const radiusZ = ellipseMode ? parseFloat(document.getElementById('ellipseRadiusZInput').value) : 0;
        
        if (ellipseMode) {
            if (isNaN(radiusX) || isNaN(radiusZ) || radiusX <= 0 || radiusZ <= 0) {
                alert('타원 반지름은 0보다 큰 숫자여야 합니다.');
                return;
            }
            if (rotationAxis !== 'Y') {
                alert('타원 모드는 Y축 회전(XZ 평면)만 지원합니다.');
                return;
            }
        }
        
        createRotationTrace(tStart, tEnd, tStep, rotationAxis, { x: axisX, y: axisY, z: axisZ }, isRelative, ellipseMode, radiusX, radiusZ);
    });

    // 자취 삭제 버튼
    document.getElementById('deleteTraceBtn').addEventListener('click', () => {
        deleteSelectedTrace();
    });

    // 타원 모드 체크박스 토글
    document.getElementById('ellipseModeCheck').addEventListener('change', (e) => {
        const ellipseControls = document.getElementById('ellipseControls');
        ellipseControls.style.display = e.target.checked ? 'flex' : 'none';
        updateEllipseDisplay();
    });

    // 타원 반지름 입력 시 실시간 업데이트
    document.getElementById('ellipseRadiusXInput').addEventListener('input', updateEllipseDisplay);
    document.getElementById('ellipseRadiusZInput').addEventListener('input', updateEllipseDisplay);

    // 타원 표시 업데이트 함수
    function updateEllipseDisplay() {
        const radiusX = parseFloat(document.getElementById('ellipseRadiusXInput').value) || 0;
        const radiusZ = parseFloat(document.getElementById('ellipseRadiusZInput').value) || 0;
        const majorAxis = Math.max(radiusX, radiusZ);
        const minorAxis = Math.min(radiusX, radiusZ);
        
        document.getElementById('majorAxisValue').textContent = majorAxis.toFixed(1);
        document.getElementById('minorAxisValue').textContent = minorAxis.toFixed(1);
    }

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

    // 클립보드에 복사
    document.getElementById('copyBtn').addEventListener('click', async () => {
        try {
            if (currentJsonData && currentJsonData.groups && currentJsonData.groups.length > 0) {
                const jsonText = JSON.stringify(currentJsonData, null, 2);
                await navigator.clipboard.writeText(jsonText);
                alert(`클립보드에 복사되었습니다!\n(그룹 ${currentJsonData.groups.length}개, 자취 포함)`);
            } else {
                alert('복사할 데이터가 없습니다. 먼저 데이터를 불러오거나 자취를 생성해주세요.');
            }
        } catch (err) {
            alert('클립보드 복사 실패: ' + err.message);
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

    // 회전 모드 버튼들
    const rotateHorizontalBtn = document.getElementById('rotateHorizontalBtn');
    const rotateVerticalBtn = document.getElementById('rotateVerticalBtn');
    
    rotateHorizontalBtn.addEventListener('click', () => {
        setRotationMode('horizontal');
        // 버튼 스타일 업데이트
        rotateHorizontalBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        rotateVerticalBtn.style.background = '';
    });
    
    rotateVerticalBtn.addEventListener('click', () => {
        setRotationMode('vertical');
        // 버튼 스타일 업데이트
        rotateVerticalBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
        rotateHorizontalBtn.style.background = '';
    });
    
    // 기본 모드 설정 (좌우 회전)
    setTimeout(() => {
        if (controls) {
            setRotationMode('horizontal');
        }
    }, 100);

    // 카메라 뷰 전환 버튼들
    document.getElementById('viewXYBtn').addEventListener('click', () => {
        setCameraViewXY();
    });

    document.getElementById('viewXZBtn').addEventListener('click', () => {
        setCameraViewXZ();
    });

    document.getElementById('viewYZBtn').addEventListener('click', () => {
        setCameraViewYZ();
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