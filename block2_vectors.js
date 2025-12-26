/** === 1) 입력 JSON (질문에 주신 데이터 그대로) === */
const DEFAULT_JSON = {
  "_schema": {
    "tiles": "전체 타일 배열 - 각 타일은 {r: 행, c: 열, angle: 각도, direction: 방향}",
    "groups": "같은 방향의 타일 그룹 배열 - 각 그룹은 유사한 각도를 가진 타일들의 모음",
    "groups[].tiles": "그룹 내 타일 인덱스 배열",
    "groups[].avgAngle": "그룹의 평균 각도 (도 단위, 0=동쪽, 90=북쪽, 180=서쪽, 270=남쪽)",
    "groups[].direction": "그룹의 방향을 나타내는 텍스트",
    "groups[].angles": "그룹 내 각 타일의 개별 각도 배열",
    "metadata": "데이터 메타정보 (타일 수, 그룹 수, 생성 시간 등)"
  },
  "tiles": [
    {"r":0,"c":1},{"r":2,"c":3},{"r":4,"c":5},{"r":6,"c":7},{"r":8,"c":9},{"r":10,"c":11},{"r":12,"c":13},
    {"r":14,"c":14},{"r":16,"c":15},{"r":18,"c":16},{"r":20,"c":18},{"r":22,"c":20},{"r":24,"c":22},
    {"r":26,"c":24},{"r":28,"c":26},{"r":30,"c":24},{"r":32,"c":22},{"r":34,"c":20},{"r":35,"c":18},
    {"r":36,"c":16},{"r":37,"c":14},{"r":38,"c":12},{"r":40,"c":10},{"r":41,"c":12},{"r":43,"c":12},
    {"r":45,"c":12},{"r":47,"c":12},{"r":49,"c":12},{"r":51,"c":12},{"r":53,"c":11},{"r":55,"c":10}
  ],
  "groups": [
    {
      "tiles":[{"r":0,"c":1},{"r":2,"c":3},{"r":4,"c":5},{"r":6,"c":7},{"r":8,"c":9},{"r":10,"c":11},{"r":12,"c":13},{"r":14,"c":14},{"r":16,"c":15},{"r":18,"c":16},{"r":20,"c":18},{"r":22,"c":20},{"r":24,"c":22},{"r":26,"c":24},{"r":28,"c":26}],
      "avgAngle":311.04965382365964,"direction":"남동쪽 (Southeast, ↘)",
      "angles":[315,315,315,315,315,315,296.565051177078,296.565051177078,296.565051177078,315,315,315,315,315],
      "tileCount":15
    },
    {
      "tiles":[{"r":28,"c":26},{"r":30,"c":24},{"r":32,"c":22},{"r":34,"c":20},{"r":35,"c":18},{"r":36,"c":16},{"r":37,"c":14},{"r":38,"c":12},{"r":40,"c":10}],
      "avgAngle":215.782525588539,"direction":"남서쪽 (Southwest, ↙)",
      "angles":[225,225,225,206.56505117707798,206.56505117707798,206.56505117707798,206.56505117707798,225],
      "tileCount":9
    },
    {"tiles":[{"r":40,"c":10},{"r":41,"c":12}],"avgAngle":333.434948822922,"direction":"남동쪽 (Southeast, ↘)","angles":[333.434948822922],"tileCount":2},
    {
      "tiles":[{"r":41,"c":12},{"r":43,"c":12},{"r":45,"c":12},{"r":47,"c":12},{"r":49,"c":12},{"r":51,"c":12},{"r":53,"c":11},{"r":55,"c":10}],
      "avgAngle":262.4099853779777,"direction":"남쪽 (South, ↓)",
      "angles":[270,270,270,270,270,243.43494882292202,243.43494882292202],
      "tileCount":8
    }
  ],
  "metadata":{"totalTiles":31,"totalGroups":4,"timestamp":"2025-12-26T02:52:09.432Z","source":"Block Move Solver"}
};

/** === 2) 유틸 === */
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function uniqKey(rc){ return `${rc.r},${rc.c}`; }

// 고정 팔레트(그룹 색)
const GROUP_COLORS = [
  "#e74c3c", "#2ecc71", "#3498db", "#f1c40f",
  "#9b59b6", "#1abc9c", "#e67e22", "#34495e"
];

function tileCenterPx(tile, cell, pad){
  // (c, r)을 (x, y)로. 타일 1칸의 중심.
  return {
    x: pad + (tile.c + 0.5) * cell,
    y: pad + (tile.r + 0.5) * cell
  };
}

/** * 타일이 같은지 비교
 */
function tileEquals(t1, t2){
  return t1.r === t2.r && t1.c === t2.c;
}

/** * PCA로 점들의 “가장 잘 맞는 직선”을 구함.
 * 반환: {p0, p1} (캔버스에 그릴 수 있게, 그룹 점들의 투영 범위의 양 끝점)
 */
function fitLinePCA(points){
  // 평균
  let mx=0, my=0;
  for (const p of points){ mx += p.x; my += p.y; }
  mx /= points.length; my /= points.length;

  // 공분산(2x2)
  let sxx=0, sxy=0, syy=0;
  for (const p of points){
    const dx = p.x - mx, dy = p.y - my;
    sxx += dx*dx; sxy += dx*dy; syy += dy*dy;
  }

  // 2x2 고유벡터: 가장 큰 고유값의 방향
  // [sxx sxy; sxy syy]
  const tr = sxx + syy;
  const det = sxx*syy - sxy*sxy;
  const disc = Math.max(0, tr*tr - 4*det);
  const lambda1 = (tr + Math.sqrt(disc))/2; // 최대 고유값

  // (A - λI)v = 0
  let vx, vy;
  if (Math.abs(sxy) > 1e-9){
    vx = lambda1 - syy;
    vy = sxy;
  } else {
    // 대각행렬에 가까우면 분산 큰 축 선택
    if (sxx >= syy){ vx = 1; vy = 0; }
    else { vx = 0; vy = 1; }
  }
  const norm = Math.hypot(vx, vy) || 1;
  vx /= norm; vy /= norm;

  // 모든 점을 (mx,my)+t*(vx,vy)에 투영해서 t의 min/max로 양 끝점을 생성
  let tmin = Infinity, tmax = -Infinity;
  for (const p of points){
    const dx = p.x - mx, dy = p.y - my;
    const t = dx*vx + dy*vy;
    tmin = Math.min(tmin, t);
    tmax = Math.max(tmax, t);
  }

  return {
    p0: { x: mx + tmin*vx, y: my + tmin*vy },
    p1: { x: mx + tmax*vx, y: my + tmax*vy },
  };
}

/**
 * PCA 방향 벡터만 계산 (단위 벡터)
 * 반환: {vx, vy}
 */
function getPCADirection(points){
  // 평균
  let mx=0, my=0;
  for (const p of points){ mx += p.x; my += p.y; }
  mx /= points.length; my /= points.length;

  // 공분산(2x2)
  let sxx=0, sxy=0, syy=0;
  for (const p of points){
    const dx = p.x - mx, dy = p.y - my;
    sxx += dx*dx; sxy += dx*dy; syy += dy*dy;
  }

  // 2x2 고유벡터: 가장 큰 고유값의 방향
  const tr = sxx + syy;
  const det = sxx*syy - sxy*sxy;
  const disc = Math.max(0, tr*tr - 4*det);
  const lambda1 = (tr + Math.sqrt(disc))/2;

  let vx, vy;
  if (Math.abs(sxy) > 1e-9){
    vx = lambda1 - syy;
    vy = sxy;
  } else {
    if (sxx >= syy){ vx = 1; vy = 0; }
    else { vx = 0; vy = 1; }
  }
  const norm = Math.hypot(vx, vy) || 1;
  vx /= norm; vy /= norm;

  return {vx, vy};
}

/**
 * 앵커 기반 PCA 직선: 시작/끝 앵커를 지나도록 직선을 조정
 * anchor0: 시작 앵커 점
 * anchor1: 끝 앵커 점
 * direction: {vx, vy} PCA 방향 벡터
 * 반환: {p0, p1}
 */
function fitLinePCAWithAnchors(anchor0, anchor1, direction){
  const {vx, vy} = direction;
  
  // anchor0를 기준점으로 하여, anchor1을 PCA 직선 위에 투영
  const dx = anchor1.x - anchor0.x;
  const dy = anchor1.y - anchor0.y;
  const proj = dx*vx + dy*vy;
  
  // 투영된 끝점
  const p1 = {
    x: anchor0.x + proj*vx,
    y: anchor0.y + proj*vy
  };
  
  return {
    p0: anchor0,
    p1: p1
  };
}

/**
 * 모든 그룹의 PCA 앵커 연결 직선을 미리 계산 (2-Pass 렌더링)
 * 원형 경로를 탐지하여 완벽한 연결 보장
 */
function computePCALinesWithAnchors(groups, cell, pad){
  if (groups.length === 0) return [];
  
  // 원형 경로 탐지: 마지막 그룹의 끝 타일 == 첫 그룹의 시작 타일
  const firstGroup = groups[0];
  const lastGroup = groups[groups.length - 1];
  const firstTiles = firstGroup.tiles || [];
  const lastTiles = lastGroup.tiles || [];
  
  let isCircular = false;
  if (firstTiles.length > 0 && lastTiles.length > 0){
    const firstStart = firstTiles[0];
    const lastEnd = lastTiles[lastTiles.length - 1];
    isCircular = tileEquals(lastEnd, firstStart);
    if (isCircular){
      console.log('🔄 원형 경로 탐지:', lastEnd, '→', firstStart);
    }
  }
  
  // 1st Pass: 초기 계산
  const lineData = [];
  let prevEndPoint = null;
  
  for (let gi = 0; gi < groups.length; gi++){
    const g = groups[gi];
    const tiles = g.tiles || [];
    if (tiles.length === 0){
      lineData.push(null);
      continue;
    }
    
    const pts = tiles.map(t => tileCenterPx(t, cell, pad));
    
    // 시작 앵커
    let anchor0 = pts[0];
    if (gi > 0 && prevEndPoint !== null){
      const prevGroup = groups[gi - 1];
      const prevTiles = prevGroup.tiles || [];
      if (prevTiles.length > 0 && tileEquals(prevTiles[prevTiles.length - 1], tiles[0])){
        anchor0 = prevEndPoint;
        console.log(`G${gi} 시작 앵커 (G${gi-1}과 공유):`, tiles[0], `→ 픽셀:`, anchor0);
      }
    }
    
    // 끝 앵커
    let anchor1 = pts[pts.length - 1];
    if (gi < groups.length - 1){
      const nextGroup = groups[gi + 1];
      const nextTiles = nextGroup.tiles || [];
      if (nextTiles.length > 0 && tileEquals(tiles[tiles.length - 1], nextTiles[0])){
        anchor1 = tileCenterPx(tiles[tiles.length - 1], cell, pad);
        console.log(`G${gi} 끝 앵커 (G${gi+1}과 공유):`, tiles[tiles.length - 1], `→ 픽셀:`, anchor1);
      }
    }
    
    // PCA 방향 계산
    const direction = getPCADirection(pts);
    const { p0, p1 } = fitLinePCAWithAnchors(anchor0, anchor1, direction);
    
    lineData.push({ p0, p1, anchor0, anchor1, direction, pts });
    prevEndPoint = p1;
  }
  
  // 원형 경로인 경우: 첫 그룹의 시작점을 마지막 그룹의 끝점으로 조정
  if (isCircular && lineData[0] && prevEndPoint){
    console.log('🔄 원형 경로 연결: G0 시작점 =', lineData[0].p0, '→', prevEndPoint);
    
    // 첫 그룹을 마지막 그룹의 끝점에서 시작하도록 재계산
    const firstLineData = lineData[0];
    const { p0: newP0, p1: newP1 } = fitLinePCAWithAnchors(
      prevEndPoint, 
      firstLineData.anchor1, 
      firstLineData.direction
    );
    lineData[0] = { ...firstLineData, p0: newP0, p1: newP1 };
  }
  
  return lineData;
}

/** === 3) 렌더 === */
const cv = document.getElementById("cv");
const ctx = cv.getContext("2d");

const jsonArea = document.getElementById("jsonArea");
jsonArea.value = JSON.stringify(DEFAULT_JSON, null, 2);

const elCell = document.getElementById("cell");
const elShowGrid = document.getElementById("showGrid");
const elShowAllTiles = document.getElementById("showAllTiles");
const elHighlightGroups = document.getElementById("highlightGroups");
const elDrawEndpointLine = document.getElementById("drawEndpointLine");
const elDrawPcaLine = document.getElementById("drawPcaLine");
const elDrawPcaLineAnchored = document.getElementById("drawPcaLineAnchored");
document.getElementById("rerender").addEventListener("click", render);

function computeBounds(data){
  // tiles + groups를 모두 검사해서 최대 r/c를 잡음
  let maxR=0, maxC=0;
  const scan = (t) => { maxR = Math.max(maxR, t.r); maxC = Math.max(maxC, t.c); };
  (data.tiles || []).forEach(scan);
  (data.groups || []).forEach(g => (g.tiles || []).forEach(scan));
  return { maxR, maxC };
}

function drawGrid(cell, pad, maxR, maxC){
  ctx.save();
  ctx.strokeStyle = "#eee";
  ctx.lineWidth = 1;

  const w = pad*2 + (maxC+1)*cell;
  const h = pad*2 + (maxR+1)*cell;

  for (let r=0; r<=maxR+1; r++){
    const y = pad + r*cell;
    ctx.beginPath(); ctx.moveTo(pad, y); ctx.lineTo(w-pad, y); ctx.stroke();
  }
  for (let c=0; c<=maxC+1; c++){
    const x = pad + c*cell;
    ctx.beginPath(); ctx.moveTo(x, pad); ctx.lineTo(x, h-pad); ctx.stroke();
  }
  ctx.restore();
}

function drawDot(p, color, radius=3){
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, radius, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}

function drawLine(a, b, color, width=3, dashed=false){
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  if (dashed) ctx.setLineDash([10, 7]);
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}

function renderLegend(data){
  const box = document.getElementById("legend");
  box.innerHTML = "";
  (data.groups || []).forEach((g, i) => {
    const color = GROUP_COLORS[i % GROUP_COLORS.length];
    const sw = document.createElement("div");
    sw.className = "swatch";
    sw.style.background = color;

    const txt = document.createElement("div");
    const n = (g.tiles || []).length;
    txt.textContent = `G${i} (${n} tiles) - ${g.direction || ""} / avgAngle=${(g.avgAngle ?? "").toString().slice(0,8)}`;

    box.appendChild(sw);
    box.appendChild(txt);
  });
}

function render(){
  let data;
  try {
    data = JSON.parse(jsonArea.value);
  } catch (e){
    alert("JSON 파싱 실패: " + e.message);
    return;
  }

  const cell = clamp(parseInt(elCell.value || "12", 10), 6, 80);
  const pad = 30;

  const { maxR, maxC } = computeBounds(data);
  const w = pad*2 + (maxC+1)*cell;
  const h = pad*2 + (maxR+1)*cell;
  cv.width = Math.max(300, Math.ceil(w));
  cv.height = Math.max(300, Math.ceil(h));

  // clear
  ctx.clearRect(0,0,cv.width,cv.height);

  // grid
  if (elShowGrid.checked) drawGrid(cell, pad, maxR, maxC);

  // 전체 tiles 점(회색)
  if (elShowAllTiles.checked){
    const seen = new Set();
    for (const t of (data.tiles || [])){
      const k = uniqKey(t);
      if (seen.has(k)) continue;
      seen.add(k);
      drawDot(tileCenterPx(t, cell, pad), "#888", 2.4);
    }
  }

  // 그룹별
  renderLegend(data);

  const groups = data.groups || [];
  
  // === PCA 앵커 연결 직선: 2-Pass 렌더링 ===
  let pcaAnchoredLines = null;
  
  if (elDrawPcaLineAnchored.checked){
    // 1st Pass: 모든 그룹의 앵커와 끝점을 미리 계산
    pcaAnchoredLines = computePCALinesWithAnchors(groups, cell, pad);
  }
  
  (groups).forEach((g, gi) => {
    const color = GROUP_COLORS[gi % GROUP_COLORS.length];
    const tiles = (g.tiles || []);
    if (tiles.length === 0) return;

    // 타일 중심점 목록
    const pts = tiles.map(t => tileCenterPx(t, cell, pad));

    // 그룹 타일 하이라이트(사각형)
    if (elHighlightGroups.checked){
      ctx.save();
      ctx.fillStyle = color + "33"; // 반투명
      ctx.strokeStyle = color + "aa";
      ctx.lineWidth = 1.5;
      for (const t of tiles){
        const x = pad + t.c*cell;
        const y = pad + t.r*cell;
        ctx.fillRect(x, y, cell, cell);
        ctx.strokeRect(x+0.5, y+0.5, cell-1, cell-1);
      }
      ctx.restore();
    }

    // 시작/끝점(첫/마지막)
    const pStart = pts[0];
    const pEnd = pts[pts.length - 1];

    // 엔드포인트 직선
    if (elDrawEndpointLine.checked && tiles.length >= 2){
      drawLine(pStart, pEnd, color, 4, false);
      drawDot(pStart, color, 4);
      drawDot(pEnd, color, 4);
    }

    // PCA(최소자승) 직선(점선)
    if (elDrawPcaLine.checked && pts.length >= 2){
      const { p0, p1 } = fitLinePCA(pts);
      drawLine(p0, p1, color, 2.5, true);
    }

    // PCA 앵커 연결 직선(실선) - 2nd Pass: 미리 계산된 정보로 그리기
    if (pcaAnchoredLines && pcaAnchoredLines[gi]){
      const lineInfo = pcaAnchoredLines[gi];
      drawLine(lineInfo.p0, lineInfo.p1, color, 3.5, false);
      drawDot(lineInfo.p0, color, 5);
      drawDot(lineInfo.p1, color, 5);
    }

    // 그룹 라벨(중앙 근처)
    const mid = pts[Math.floor(pts.length/2)];
    ctx.save();
    ctx.fillStyle = "#111";
    ctx.font = "12px system-ui, sans-serif";
    ctx.fillText(`G${gi}`, mid.x + 6, mid.y - 6);
    ctx.restore();
  });
}

render();
