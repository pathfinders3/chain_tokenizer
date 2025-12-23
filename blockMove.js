/**
 * Tile Cover Solver + Visualizer (JavaScript)
 * ------------------------------------------
 * - grid: 2D array with 0/1 (1 = orange)
 * - k: 2 or 3 (k×k tile)
 * - Finds placements that maximize covered orange cells (overlap-free).
 * - Prints up to `limit` best solutions.
 * - Visualizes each solution as an ASCII grid.
 * - Computes path angles and delta angles (after ordering tiles by a chosen rule).
 *
 * Usage (browser console / Node):
 *   printBestTilePlacements(grid, 2, 4, { showVisual: true, showDirections: true, order: "weighted" });
 */

/* ------------------------- Example 8×8 grid ------------------------- */
// 상단 4행 전부 오렌지 + 5번째 행(인덱스4) 오른쪽 4칸 오렌지 (총 36칸)
const DEMO_GRID = [
  [1,1,1,1,1,1,1,1],
  [1,1,1,1,0,1,1,1],
  [1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1],
  [0,0,0,0,1,1,1,1],
  [0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0],
];
  
  /* ------------------------- BigInt bit helpers ------------------------- */
  const bitAt = (i) => 1n << BigInt(i);
  
  function popcount(n) {
    let c = 0;
    while (n) { c += Number(n & 1n); n >>= 1n; }
    return c;
  }
  const lowestBit = (n) => n & -n; // BigInt ok
  
  function bitToIndex(b) {
    // b is a power-of-two BigInt
    let i = 0;
    while ((b & 1n) === 0n) { b >>= 1n; i++; }
    return i;
  }
  
  /* ------------------------- Visualization ------------------------- */
  function renderPlacementGrid(grid, tiles, k) {
    if (!grid || !Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0])) {
      console.error("renderPlacementGrid(): invalid grid (expected 2D array)", grid);
      throw new TypeError("renderPlacementGrid(): invalid grid (expected 2D array)");
    }
    const H = grid.length;
    const W = grid[0].length;
  
    // '.' = 일반(0), 'o' = 오렌지(1)인데 안 덮임, 'A'~ = 타일로 덮인 오렌지
    const out = Array.from({ length: H }, (_, r) =>
      Array.from({ length: W }, (_, c) => (grid[r][c] === 1 ? "o" : "."))
    );
  
    const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let t = 0; t < tiles.length; t++) {
      const { r, c } = tiles[t];
      const ch = labels[t % labels.length];
      for (let dr = 0; dr < k; dr++) {
        for (let dc = 0; dc < k; dc++) {
          // why: 경계 방어 (이미지 인식 오류로 경계 밖 좌표가 들어오는 경우 대비)
          if (r + dr >= 0 && r + dr < H && c + dc >= 0 && c + dc < W) {
            out[r + dr][c + dc] = ch;
          }
        }
      }
    }
    return out;
  }
  
  function printPlacementAscii(grid, tiles, k, title = "") {
    if (!grid || !Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0])) {
      console.error("printPlacementAscii(): invalid grid (expected 2D array)", grid);
      throw new TypeError("printPlacementAscii(): invalid grid (expected 2D array)");
    }
    const view = renderPlacementGrid(grid, tiles, k);
    if (title) console.log(title);

    const colHeader = "     " + [...Array(view[0].length)].map((_, i) => (i % 10)).join(" ");
    console.log(colHeader);

    for (let r = 0; r < view.length; r++) {
      console.log(String(r).padStart(2, " ") + " | " + view[r].join(" "));
    }
    console.log("Legend: '.'=0(일반), 'o'=1(오렌지 미덮임), 문자=타일로 덮인 영역");
  }

  function printGridOnly(grid, title = "") {
    if (!grid || !Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0])) {
      console.error("printGridOnly(): invalid grid (expected 2D array)", grid);
      throw new TypeError("printGridOnly(): invalid grid (expected 2D array)");
    }
    const out = Array.from({ length: grid.length }, (_, r) =>
      Array.from({ length: grid[0].length }, (_, c) => (grid[r][c] === 1 ? "o" : "."))
    );
    if (title) console.log(title);

    const colHeader = "     " + [...Array(out[0].length)].map((_, i) => (i % 10)).join(" ");
    console.log(colHeader);

    for (let r = 0; r < out.length; r++) {
      console.log(String(r).padStart(2, " ") + " | " + out[r].join(" "));
    }
    console.log("Legend: '.'=0(일반), 'o'=1(오렌지)");
  }
  
  /* ------------------------- Direction & Delta (Angles) ------------------------- */
  function tileCenter(t, k) {
    const half = (k - 1) / 2;
    return { x: t.c + half, y: t.r + half }; // (x=col, y=row)
  }
  
  function angleDegCart(a, b) {
    // 데카르트 기준: 오른쪽 0°, 위 90°
    // grid row는 아래로 증가 => dy를 반전해야 "위=+y"
    const dx = b.x - a.x;
    const dy = -(b.y - a.y);
    let deg = Math.atan2(dy, dx) * 180 / Math.PI;
    if (deg < 0) deg += 360;
    return deg;
  }
  
  function angleDiff(deg1, deg2) {
    let d = Math.abs(deg2 - deg1);
    return Math.min(d, 360 - d); // 0~180
  }
  
  function arrowFromAngle(deg) {
    const dirs = [
      { a: 0,   ch: "→" },
      { a: 45,  ch: "↗" },
      { a: 90,  ch: "↑" },
      { a: 135, ch: "↖" },
      { a: 180, ch: "←" },
      { a: 225, ch: "↙" },
      { a: 270, ch: "↓" },
      { a: 315, ch: "↘" },
    ];
    let best = dirs[0];
    let bestDiff = 1e9;
    for (const d of dirs) {
      let diff = Math.abs(deg - d.a);
      diff = Math.min(diff, 360 - diff);
      if (diff < bestDiff) { bestDiff = diff; best = d; }
    }
    return best.ch;
  }
  
  function computeTileDirectionsAndDeltas(tiles, k) {
    if (tiles.length < 2) return { angles: [], deltas: [] };
  
    const centers = tiles.map(t => tileCenter(t, k));
  
    const angles = [];
    for (let i = 0; i < centers.length - 1; i++) {
      angles.push(angleDegCart(centers[i], centers[i + 1]));
    }
  
    const deltas = [];
    for (let i = 0; i < angles.length - 1; i++) {
      deltas.push(angleDiff(angles[i], angles[i + 1]));
    }
  
    return { angles, deltas };
  }
  
  function printTileDirectionsAndDeltas(tiles, k, title = "Directions & ΔAngles") {
    const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    const { angles, deltas } = computeTileDirectionsAndDeltas(tiles, k);
  
    console.log("\n" + title);
    if (angles.length === 0) {
      console.log("(타일이 1개 이하라 각도 계산 불가)");
      return;
    }
  
    for (let i = 0; i < angles.length; i++) {
      const la = labels[i % labels.length];
      const lb = labels[(i + 1) % labels.length];
      console.log(`${la}→${lb} : ${angles[i].toFixed(1)}° ${arrowFromAngle(angles[i])}`);
    }
  
    if (deltas.length === 0) {
      console.log("ΔAngles: (이동이 1번뿐이라 없음)");
      return;
    }
  
    console.log("ΔAngles (change between moves):");
    for (let i = 0; i < deltas.length; i++) {
      const la = labels[i % labels.length];
      const lb = labels[(i + 1) % labels.length];
      const lc = labels[(i + 2) % labels.length];
      console.log(`(${la}→${lb}) → (${lb}→${lc}) : Δ ${deltas[i].toFixed(1)}°`);
    }
  }
  
  /* ------------------------- Next-tile ordering strategies ------------------------- */
function dist2(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    return dx*dx + dy*dy;
}

function tileDist(centA, centB, k) {
  return Math.sqrt(dist2(centA, centB)) / k;
}

function getCandidateInfo(curIdx, candidateIdx, centers, tiles, k, prevAngle) {
  const dist = Math.sqrt(dist2(centers[curIdx], centers[candidateIdx]));
  const ang = angleDegCart(centers[curIdx], centers[candidateIdx]);
  const turn = (prevAngle == null) ? 0 : angleDiff(prevAngle, ang);
  const isAdjacent = areTilesAdjacent(tiles[curIdx], tiles[candidateIdx], k);
  return { dist, ang, turn, isAdjacent };
}
  
  // Strategy A: nearest neighbor
  function nextByNearest(curIdx, prevAngle, centers, unusedSet) {
    let best = null;
    let bestD = Infinity;
    for (const i of unusedSet) {
      const d = dist2(centers[curIdx], centers[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  
  // Strategy B: minimal turning (needs prevAngle to be meaningful)
  function nextByMinTurn(curIdx, prevAngle, centers, unusedSet) {
    let best = null;
    let bestTurn = Infinity;
    for (const i of unusedSet) {
      const ang = angleDegCart(centers[curIdx], centers[i]);
      const turn = (prevAngle == null) ? 0 : angleDiff(prevAngle, ang);
      if (turn < bestTurn) { bestTurn = turn; best = i; }
    }
    return best;
  }
  
  function findClosestAdjacentTile(curIdx, centers, unusedSet, tiles, k) {
    let best = null;
    let bestD = Infinity;
    for (const i of unusedSet) {
      const info = getCandidateInfo(curIdx, i, centers, tiles, k, null);
      if (info.isAdjacent && info.dist * info.dist < bestD) {
        bestD = info.dist * info.dist;
        best = i;
      }
    }
    return best;
  }

  function makeNextByWeightedWithMaxDist({ wDist = 1.0, wTurn = 2.5, maxDist = 2.5 } = {}) {
    return function next(curIdx, prevAngle, centers, unusedSet, k, tiles) {
      let best = null;
      let bestScore = Infinity;

      for (const i of unusedSet) {
        const info = getCandidateInfo(curIdx, i, centers, tiles, k, prevAngle);
        if (info.dist > maxDist || !info.isAdjacent) continue;
        
        const score = wDist * info.dist + wTurn * info.turn;
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      }

      if (best == null) {
        best = findClosestAdjacentTile(curIdx, centers, unusedSet, tiles, k);
        if (best != null) {
          console.log(`Fallback to closest adjacent tile at (${tiles[best].r}, ${tiles[best].c})`);
        }
      }
      return best;
    };
  }

  function makeNextPreferAngleIfDiagonal({
    diagTileDist = Math.SQRT2 + 1e-9,
    wTurn = 1.0,
  } = {}) {
    return function next(curIdx, prevAngle, centers, unusedSet, k, tiles) {
      const close = [];
      for (const i of unusedSet) {
        const dTile = tileDist(centers[curIdx], centers[i], k);
        if (dTile <= diagTileDist) {
          const info = getCandidateInfo(curIdx, i, centers, tiles, k, prevAngle);
          if (info.isAdjacent) close.push({ i, dTile, turn: info.turn });
        }
      }

      if (close.length > 0) {
        close.sort((a, b) => a.turn - b.turn || a.dTile - b.dTile);
        return close[0].i;
      }

      const best = findClosestAdjacentTile(curIdx, centers, unusedSet, tiles, k);
      if (best == null) {
        console.log(`No adjacent tile found. Stopping selection.`);
      }
      return best;
    };
  }

  // 타일이 닿는지 확인하는 함수 (직접 닿거나 대각선으로 닿는 경우)
  function areTilesAdjacent(tileA, tileB, k) {
    const r1 = tileA.r, c1 = tileA.c;
    const r2 = tileB.r, c2 = tileB.c;
    const tileSize = k;

    // 타일의 경계 좌표 계산
    const r1_end = r1 + tileSize - 1;
    const c1_end = c1 + tileSize - 1;
    const r2_end = r2 + tileSize - 1;
    const c2_end = c2 + tileSize - 1;

    // 직접 닿는 경우 (상하좌우)
    const horizontalTouch = (r1 <= r2_end && r2 <= r1_end) && (c1_end === c2 - 1 || c2_end === c1 - 1);
    const verticalTouch = (c1 <= c2_end && c2 <= c1_end) && (r1_end === r2 - 1 || r2_end === r1 - 1);

    // 대각선으로 닿는 경우 (타일 크기 k=2일 때, (r,c)와 (r+2,c+2) 등)
    const diagonalTouch = (Math.abs(r1 - r2) === tileSize && Math.abs(c1 - c2) === tileSize);

    return horizontalTouch || verticalTouch || diagonalTouch;
  }

  // 두 타일이 겹치는지 확인하는 함수
  function tilesOverlap(tileA, tileB, k) {
    const r1 = tileA.r, c1 = tileA.c;
    const r2 = tileB.r, c2 = tileB.c;
    
    // 타일 A의 영역: [r1, r1+k) x [c1, c1+k)
    // 타일 B의 영역: [r2, r2+k) x [c2, c2+k)
    // 겹치지 않는 조건: r1+k <= r2 || r2+k <= r1 || c1+k <= c2 || c2+k <= c1
    // 겹치는 조건: 위의 부정
    const noOverlap = (r1 + k <= r2) || (r2 + k <= r1) || (c1 + k <= c2) || (c2 + k <= c1);
    return !noOverlap;
  }


function selectStartTile(tiles, startRule, customStartTile) {
    let startIdx = 0;
    if (startRule === "topleft") {
      console.log(`Top-Left selection - All tiles: ${tiles.map((t, idx) => `[${idx}]:(${t.r},${t.c})`).join(" ")}`);
      for (let i = 1; i < tiles.length; i++) {
        if (tiles[i].r < tiles[startIdx].r || (tiles[i].r === tiles[startIdx].r && tiles[i].c < tiles[startIdx].c)) {
          startIdx = i;
        }
      }
    } else if (startRule === "topright") {
      for (let i = 1; i < tiles.length; i++) {
        if (tiles[i].r < tiles[startIdx].r || (tiles[i].r === tiles[startIdx].r && tiles[i].c > tiles[startIdx].c)) {
          startIdx = i;
        }
      }
    } else if (startRule === "custom" && customStartTile) {
      const found = tiles.findIndex(t => t.r === customStartTile.r && t.c === customStartTile.c);
      if (found !== -1) {
        startIdx = found;
        console.log(`Custom start tile found at (${tiles[startIdx].r}, ${tiles[startIdx].c})`);
      } else {
        console.log(`Warning: Custom start tile not found. Using closest tile.`);
        let minDist = Infinity;
        for (let i = 0; i < tiles.length; i++) {
          const dist = Math.sqrt((tiles[i].r - customStartTile.r)**2 + (tiles[i].c - customStartTile.c)**2);
          if (dist < minDist) {
            minDist = dist;
            startIdx = i;
          }
        }
      }
    } else if (typeof startRule === "function") {
      startIdx = startRule(tiles);
    }
    return startIdx;
}

function orderTilesWithNextRule(tiles, k, nextRule, startRule = "topleft", maxAngleDiff = Infinity, grid, customStartTile = null, startAngle = null) {
    if (tiles.length <= 1) {
      return {
        orderedTiles: tiles.slice(),
        state: {
          orderIdx: tiles.length === 1 ? [0] : [],
          unused: new Set(),
          cur: 0,
          prevAngle: startAngle !== null ? startAngle : null,
          centers: tiles.map(t => tileCenter(t, k)),
          tiles,
          k,
          nextRule,
          maxAngleDiff,
          grid
        }
      };
    }

    const centers = tiles.map(t => tileCenter(t, k));
    const startIdx = selectStartTile(tiles, startRule, customStartTile);

    const unused = new Set([...Array(tiles.length).keys()]);
    unused.delete(startIdx);

    const orderIdx = [startIdx];
    let cur = startIdx;
    let prevAngle = null; // 2개의 타일이 있어야 방향이 결정되므로 null로 시작
    
    // 초기 타일 경로 업데이트
    if (typeof window !== 'undefined' && typeof window.updateTilePath === 'function') {
      window.updateTilePath([tiles[startIdx]]);
    }
    
    console.log(`Starting with null prevAngle (direction will be determined after 2 tiles are selected)`);

    while (unused.size) {
      const nxt = nextRule(cur, prevAngle, centers, unused, k, tiles);
      if (nxt == null) {
        console.log(`Stopped at tile ${orderIdx.length}. ${unused.size} tiles remain.`);
        break;
      }

      const newAngle = angleDegCart(centers[cur], centers[nxt]);
      if (prevAngle !== null && angleDiff(prevAngle, newAngle) > maxAngleDiff) {
        console.log(`Stopped at tile ${orderIdx.length}. Angle diff ${angleDiff(prevAngle, newAngle).toFixed(1)}° > ${maxAngleDiff}°. ${unused.size} tiles remain.`);
        break;
      }

      prevAngle = newAngle;
      orderIdx.push(nxt);
      unused.delete(nxt);
      cur = nxt;
      
      // 타일 경로 UI 업데이트
      if (typeof window !== 'undefined' && typeof window.updateTilePath === 'function') {
        const updatedOrderedTiles = orderIdx.map(i => tiles[i]);
        window.updateTilePath(updatedOrderedTiles);
      }
    }

    if (unused.size > 0) {
      console.log(`Warning: ${orderIdx.length}/${tiles.length} tiles visited.`);
    }

    // Return both the ordered tiles and the state for potential resumption
    return {
      orderedTiles: orderIdx.map(i => tiles[i]),
      state: {
        orderIdx,
        unused,
        cur,
        prevAngle,
        centers,
        tiles,
        k,
        nextRule,
        maxAngleDiff,
        grid
      }
    };
}

function resumeTileOrdering(state, newMaxAngleDiff = null, allPlacements = null, fullGrid = null) {
  let { orderIdx, unused, cur, prevAngle, centers, tiles, k, nextRule, maxAngleDiff, grid } = state;
  if (newMaxAngleDiff !== null) {
    maxAngleDiff = newMaxAngleDiff;
    console.log(`Resuming tile ordering with new max angle difference: ${maxAngleDiff}°`);
  } else {
    console.log(`Resuming tile ordering with original max angle difference: ${maxAngleDiff}°`);
  }

  function logCandidates(adjacentCandidates, cur, prevAngle, centers, k) {
    console.log(`\nCurrent tile: (${tiles[cur].r}, ${tiles[cur].c})`);
    console.log(`prevAngle (시작/이전 각도): ${prevAngle !== null ? prevAngle.toFixed(1) + '°' : 'null'}`);
    
    if (adjacentCandidates.length > 0) {
      console.log('Available adjacent tiles:');
      adjacentCandidates.forEach((cand, index) => {
        // 후보 타일의 중심 좌표 계산
        const candCenter = tileCenter(cand, k);
        const angle = angleDegCart(centers[cur], candCenter);
        const arrow = arrowFromAngle(angle);
        
        // prevAngle과의 차이 계산
        let angleInfo = `${angle.toFixed(1)}° ${arrow}`;
        if (prevAngle !== null) {
          const diff = angleDiff(prevAngle, angle);
          console.log(`  DEBUG: 후보 ${index} - prevAngle=${prevAngle.toFixed(1)}°, angle=${angle.toFixed(1)}°, diff=${diff.toFixed(1)}°`);
          const isPreferred = diff <= 45;
          // 콘솔에서 녹색 표시 (ANSI 색상 코드)
          const color = isPreferred ? '\x1b[32m' : '\x1b[0m'; // 녹색 또는 기본색
          const reset = '\x1b[0m';
          angleInfo = `${color}${angle.toFixed(1)}° ${arrow} (Δ${diff.toFixed(1)}°)${reset}`;
        }
        
        console.log(`  ${index}. (${cand.r}, ${cand.c}) - ${angleInfo}`);
      });
    } else {
      console.log('No adjacent tiles available.');
    }
  }

  function askUserForNextTile(adjacentCandidates, cur, prevAngle, centers, k) {
    return new Promise((resolve) => {
      // logCandidates(adjacentCandidates, cur, prevAngle, centers, k);
      if (typeof window !== 'undefined' && typeof window.showInputSection === 'function') {
        window.showInputSection(true);
      }
      if (typeof window !== 'undefined' && typeof window.updateTileOptions === 'function') {
        // 각 후보에 대한 각도 정보 계산
        const candidatesWithAngles = adjacentCandidates.map(cand => {
          const candCenter = tileCenter(cand, k);
          const angle = angleDegCart(centers[cur], candCenter);
          const diff = (prevAngle !== null) ? angleDiff(prevAngle, angle) : null;
          const isPreferred = (prevAngle !== null) && (diff <= 45);
          return { ...cand, angle, diff, isPreferred };
        });
        window.updateTileOptions([], tiles, cur, centers, k, prevAngle, candidatesWithAngles);
      }
      userInputResolver = (value) => { 
        if (typeof window !== 'undefined' && typeof window.showInputSection === 'function') {
          window.showInputSection(false);
        }
        resolve(value); 
      };
    });
  }

 /**
 * 가능한 전체 배치 중에서 현재 타일과 인접해 있으면서 아직 사용되지 않은 타일 후보들을 반환한다.
 *
 * @param {Object} currentTile - 기준이 되는 현재 타일. {r: row index, c: column index}
 * @param {number} k - 타일의 한 변의 크기(한 타일의 높이와 너비)
 * @param {Array<Array<any>>} grid - 전체 퍼즐 그리드(2차원 배열, 높이 x 너비)
 * @param {Array<Object>} existingTiles - 이미 선택(배치)된 타일들의 배열. 각 객체는 {r, c}를 가짐
 * @returns {Array<Object>} adjacent - 아직 선택되지 않았으면서 currentTile과 인접한 타일들의 배열. 각 객체는 {r, c}
 */
  function getAdjacentTileCandidates(currentTile, k, grid, existingTiles) {
    const allPlacements = (typeof window !== 'undefined' && window.savedPlacements) ? window.savedPlacements : [];
    if (!allPlacements || allPlacements.length === 0) return [];
    
    const adjacent = [];
    const H = grid.length;
    const W = grid[0].length;
    
    // placements에서 현재 타일과 인접한 타일 찾기
    for (const p of allPlacements) {
      // 이미 선택된 타일인지 확인
      const alreadySelected = existingTiles.some(t => t.r === p.r && t.c === p.c);
      if (alreadySelected) continue;
      
      // 기존에 선택된 타일들과 겹치는지 확인
      const overlapsWithExisting = existingTiles.some(t => tilesOverlap(t, { r: p.r, c: p.c }, k));
      if (overlapsWithExisting) {
        continue;
      }
      
      // 인접성 체크
      if (areTilesAdjacent(currentTile, { r: p.r, c: p.c }, k)) {
        adjacent.push({ r: p.r, c: p.c });
      }
    }
    
    return adjacent;
  }

  async function processNextTile() {
    while (true) {
      const currentOrderedTiles = orderIdx.map(i => tiles[i]);
      const adjacentCandidates = getAdjacentTileCandidates(tiles[cur], k, grid, currentOrderedTiles);
      
      if (adjacentCandidates.length === 0) {
        console.log(`No more adjacent tiles available. ${orderIdx.length} tiles selected.`);
        break;
      }

      const answer = await askUserForNextTile(adjacentCandidates, cur, prevAngle, centers, k);
      let nxt = null;

      const answerStr = String(answer).toLowerCase();
      // console.log(`User input received: "${answer}" (type: ${typeof answer})`);
      
      if (answerStr === 'stop') {
        console.log(`Stopped at tile ${orderIdx.length}.`);
        generateAndCopyResultImage(grid, tiles, orderIdx, k);
        break;
      }
      
      const choice = parseInt(answer, 10);
      // console.log(`Parsed choice: ${choice}, adjacent candidates: ${adjacentCandidates.length}`);
      
      if (Number.isNaN(choice) || choice < 0 || choice >= adjacentCandidates.length) {
        console.log('Invalid selection. Please select a valid tile.');
        continue;
      }
      
      const selectedTile = adjacentCandidates[choice];
      console.log(`☆☆ Selected tile at (${selectedTile.r}, ${selectedTile.c}).`);
      
      // 선택된 타일을 tiles 배열에 추가하고 인덱스를 얻음
      const existingIdx = tiles.findIndex(t => t.r === selectedTile.r && t.c === selectedTile.c);
      if (existingIdx !== -1) {
        nxt = existingIdx;
      } else {
        tiles.push(selectedTile);
        centers.push(tileCenter(selectedTile, k));
        nxt = tiles.length - 1;
      }

      const newAngle = angleDegCart(centers[cur], centers[nxt]);
      if (prevAngle !== null && angleDiff(prevAngle, newAngle) > maxAngleDiff) {
        console.log(`Warning: Angle diff ${angleDiff(prevAngle, newAngle).toFixed(1)}° > ${maxAngleDiff}°.`);
      }

      orderIdx.push(nxt);
      cur = nxt;
      
      // 2개 이상의 타일이 있을 때만 prevAngle 업데이트 (방향 결정)
      if (orderIdx.length >= 2) {
        prevAngle = newAngle;
        if (orderIdx.length === 2) {
          console.log(`Direction established: ${prevAngle.toFixed(1)}° ${arrowFromAngle(prevAngle)} (after 2 tiles selected)`);
        }
      }

      const updatedOrderedTiles = orderIdx.map(i => tiles[i]);
      printPlacementAscii(grid, updatedOrderedTiles, k, `-- Tile ${orderIdx.length} --`);
      
      // 타일 경로 UI 업데이트
      if (typeof window !== 'undefined' && typeof window.updateTilePath === 'function') {
        window.updateTilePath(updatedOrderedTiles);
      }
    }

    const finalOrderedTiles = orderIdx.map(i => tiles[i]);
    console.log(`All ${orderIdx.length} tiles selected.`);
    printPlacementAscii(grid, finalOrderedTiles, k, '-- Final Visual --');
    
    // 타일 경로 UI 업데이트
    if (typeof window !== 'undefined' && typeof window.updateTilePath === 'function') {
      window.updateTilePath(finalOrderedTiles);
    }

    return {
      orderedTiles: finalOrderedTiles,
      state: { orderIdx, cur, prevAngle, centers, tiles, k, nextRule, maxAngleDiff, grid }
    };
  }
  
  // 타일 삭제 함수
  if (typeof window !== 'undefined') {
    window.removeTilesFromPath = function(index) {
      console.log(`Removing tiles from index ${index} (inclusive)`);
      
      if (index === 0) {
        console.error('Cannot remove the first tile. At least one tile must remain.');
        return;
      }
      
      // 삭제 전 타일들 (유지할 타일들)
      const keptTiles = orderIdx.slice(0, index).map(i => tiles[i]);
      console.log(`Keeping ${keptTiles.length} tiles: ${keptTiles.map(t => `(${t.r},${t.c})`).join(' ')}`);
      
      // orderIdx 업데이트
      orderIdx.length = index;
      cur = orderIdx[orderIdx.length - 1];
      
      // UI 업데이트
      printPlacementAscii(grid, keptTiles, k, `-- After Removal --`);
      if (typeof window.updateTilePath === 'function') {
        window.updateTilePath(keptTiles);
      }
      
      console.log(`Tiles removed. ${keptTiles.length} tiles remaining. You can continue selecting from tile (${tiles[cur].r}, ${tiles[cur].c})`);
      
      // 사용자가 다음 타일을 선택할 수 있도록 입력 섹션 표시
      if (typeof window.showInputSection === 'function') {
        const adjacentCandidates = getAdjacentTileCandidates(tiles[cur], k, grid, keptTiles);
        if (adjacentCandidates.length > 0) {
          window.showInputSection(true);
          if (typeof window.updateTileOptions === 'function') {
            window.updateTileOptions([], tiles, cur, centers, k, prevAngle, adjacentCandidates);
          }
        } else {
          console.log('No adjacent tiles available from this position.');
        }
      }
    };
  }

  return processNextTile();
}

// 결과 이미지를 생성하고 클립보드에 복사하는 함수
function generateAndCopyResultImage(grid, tiles, orderIdx, k) {
  const H = grid.length;
  const W = grid[0].length;
  const cellSize = 20; // 각 셀의 크기 (픽셀)
  const canvas = document.getElementById('resultCanvas');
  const ctx = canvas.getContext('2d');
  
  // 캔버스 크기 설정
  canvas.width = W * cellSize;
  canvas.height = H * cellSize;
  
  // 배경을 녹색으로 설정 (아무 영역도 아닌 곳)
  ctx.fillStyle = 'green';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  // 오렌지 타일 중 미지정된 곳을 마젠타로 표시
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (grid[r][c] === 1) {
        ctx.fillStyle = 'magenta';
        ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
      }
    }
  }
  
  // 지정된 타일을 빨간색으로 표시
  const orderedTiles = orderIdx.map(i => tiles[i]);
  for (const tile of orderedTiles) {
    ctx.fillStyle = 'red';
    for (let dr = 0; dr < k; dr++) {
      for (let dc = 0; dc < k; dc++) {
        const x = (tile.c + dc) * cellSize;
        const y = (tile.r + dr) * cellSize;
        ctx.fillRect(x, y, cellSize, cellSize);
      }
    }
  }
  
  // 캔버스를 이미지로 변환하여 클립보드에 복사
  canvas.toBlob(blob => {
    const item = new ClipboardItem({ 'image/png': blob });
    navigator.clipboard.write([item]).then(() => {
      console.log('Result image copied to clipboard.');
    }, () => {
      console.error('Failed to copy image to clipboard.');
    });
  });
  
  // 캔버스 컨테이너 표시
  document.getElementById('canvasContainer').style.display = 'block';
}
  
  /* ------------------ 모든 가능한 타일 배치 찾기 (DFS 없이) ------------ */
function getAllPossiblePlacements(grid, k = 2, opts = {}) {
  const {
    startRule = "topleft",
    customStartTile = null,
    startAngle = null,
    fixedTiles = null
  } = opts;

  if (!grid || !Array.isArray(grid) || grid.length === 0 || !Array.isArray(grid[0])) {
    throw new Error("grid is empty or invalid");
  }
  const H = grid.length;
  const W = grid[0].length;
  if (!H || !W) throw new Error("grid is empty");
  if (k !== 2 && k !== 3) throw new Error("k must be 2 or 3");

  // Build orange mask
  let orangeMask = 0n;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      if (grid[r][c] === 1) orangeMask |= bitAt(r * W + c);
    }
  }
  const totalOrange = popcount(orangeMask);
  if (totalOrange === 0) {
    console.log("No orange cells (all 0).");
    return { placements: [], initialTiles: [], orangeMask, H, W };
  }

  // Precompute all possible k×k placements
  const placements = []; // {r,c,mask}
  for (let r = 0; r <= H - k; r++) {
    for (let c = 0; c <= W - k; c++) {
      let m = 0n;
      let orangeCount = 0;
      for (let dr = 0; dr < k; dr++) {
        for (let dc = 0; dc < k; dc++) {
          const rr = r + dr, cc = c + dc;
          if (grid[rr][cc] === 1) orangeCount++;
          m |= bitAt(rr * W + cc);
        }
      }
      // 타일의 모든 셀이 오렌지여야만 배치 가능
      if (orangeCount === k * k) placements.push({ r, c, mask: m });
    }
  }

  if (placements.length === 0) {
    console.log(`No ${k}×${k} placements with orange cells.`);
    console.log(`Orange cells: ${totalOrange}`);
    return { placements: [], initialTiles: [], orangeMask, H, W };
  }

  console.log(`Found ${placements.length} possible ${k}×${k} tile placements`);
  console.log(`Total orange cells: ${totalOrange}`);

  // 시작 타일 선택
  let initialTiles = [];
  
  if (fixedTiles && Array.isArray(fixedTiles) && fixedTiles.length > 0) {
    console.log(`Fixed tiles provided: ${fixedTiles.map(t => `(${t.r},${t.c})`).join(", ")}`);
    initialTiles = fixedTiles.slice();
  } else if (startRule === "custom" && customStartTile) {
    const { r: customR, c: customC } = customStartTile;
    console.log(`Custom start tile specified at (${customR}, ${customC}).`);
    initialTiles = [{ r: customR, c: customC }];
  } else if (startRule === "topleft" || startRule === "topright") {
    let selectedPlacement = null;
    
    if (startRule === "topleft") {
      for (const p of placements) {
        if (!selectedPlacement || 
            p.r < selectedPlacement.r || 
            (p.r === selectedPlacement.r && p.c < selectedPlacement.c)) {
          selectedPlacement = p;
        }
      }
    } else if (startRule === "topright") {
      for (const p of placements) {
        if (!selectedPlacement || 
            p.r < selectedPlacement.r || 
            (p.r === selectedPlacement.r && p.c > selectedPlacement.c)) {
          selectedPlacement = p;
        }
      }
    }
    
    if (selectedPlacement) {
      console.log(`${startRule === "topleft" ? "Top-Left" : "Top-Right"} start tile auto-selected at (${selectedPlacement.r}, ${selectedPlacement.c}).`);
      initialTiles = [{ r: selectedPlacement.r, c: selectedPlacement.c }];
    }
  }

  console.log(`Starting with ${initialTiles.length} tile(s): ${initialTiles.map(t => `(${t.r},${t.c})`).join(", ")}`);

  return { 
    placements, 
    initialTiles, 
    orangeMask, 
    H, 
    W,
    totalOrange,
    k
  };
}
