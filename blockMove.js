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
  // centers는 grid-cell 단위, 타일 단위로 보려면 k로 나눔
  return Math.sqrt(dist2(centA, centB)) / k;
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
  
  // Strategy C: weighted distance + turn (recommended)
  function makeNextByWeightedWithMaxDist({ wDist = 1.0, wTurn = 2.5, maxDist = 2.5 } = {}) {
    return function next(curIdx, prevAngle, centers, unusedSet, k, tiles) {
      let best = null;
      let bestScore = Infinity;

      // 1) maxDist 이내 후보만 우선
      for (const i of unusedSet) {
        const d = Math.sqrt(dist2(centers[curIdx], centers[i]));
        if (d > maxDist) continue;

        // 닿는 조건 확인 (직접 닿거나 대각선으로 닿는 경우)
        const curTile = tiles[curIdx];
        const nextTile = tiles[i];
        const isAdjacent = areTilesAdjacent(curTile, nextTile, k);
        if (!isAdjacent) continue;

        const ang = angleDegCart(centers[curIdx], centers[i]);
        const turn = (prevAngle == null) ? 0 : angleDiff(prevAngle, ang);
        const score = wDist * d + wTurn * turn;

        if (score < bestScore) { bestScore = score; best = i; }
      }

      // 2) 반경 안에 후보가 하나도 없으면, 가장 가까운 타일 중 닿는 타일로 fallback
      if (best == null) {
        let bestD = Infinity;
        for (const i of unusedSet) {
          const d = dist2(centers[curIdx], centers[i]);
          const curTile = tiles[curIdx];
          const nextTile = tiles[i];
          const isAdjacent = areTilesAdjacent(curTile, nextTile, k);
          if (isAdjacent && d < bestD) { bestD = d; best = i; }
        }
        if (best != null) {
          console.log(`No tile found within maxDist. Falling back to closest adjacent tile at (${tiles[best].r}, ${tiles[best].c})`);
        } else {
          console.log(`No adjacent tile found even in fallback. Stopping selection.`);
        }
      }
      return best;
    };
  }

  function makeNextPreferAngleIfDiagonal({
    diagTileDist = Math.SQRT2 + 1e-9, // √2 타일단위 이내면 "대각선(또는 그보다 가까움)"으로 취급
    wTurn = 1.0,                      // 각도 우선에서는 이 값만 의미(가중치라기보다 스케일)
  } = {}) {
    return function next(curIdx, prevAngle, centers, unusedSet, k, tiles) {
      // 1) 대각선(√2 타일단위) 이내 후보 수집
      const close = [];
      for (const i of unusedSet) {
        const dTile = tileDist(centers[curIdx], centers[i], k);
        if (dTile <= diagTileDist) {
          // 닿는 조건 확인 (직접 닿거나 대각선으로 닿는 경우)
          const curTile = tiles[curIdx];
          const nextTile = tiles[i];
          const isAdjacent = areTilesAdjacent(curTile, nextTile, k);
          if (isAdjacent) close.push({ i, dTile });
        }
      }

      // 2) 가까운 후보가 있으면: 각도(회전량) 우선
      if (close.length > 0) {
        let best = null;
        let bestTurn = Infinity;
        let bestDTile = Infinity;

        for (const { i, dTile } of close) {
          const ang = angleDegCart(centers[curIdx], centers[i]);
          const turn = (prevAngle == null) ? 0 : angleDiff(prevAngle, ang);

          // 1순위: turn 최소
          // 2순위: dTile 최소 (동점일 때 더 가까운 것을)
          if (turn < bestTurn || (turn === bestTurn && dTile < bestDTile)) {
            bestTurn = turn;
            bestDTile = dTile;
            best = i;
          }
        }
        return best;
      }

      // 3) 대각선 이내 후보가 없으면: 거리 우선(가장 가까운 타일 중 닿는 타일) - fallback
      let best = null;
      let bestD2 = Infinity;
      for (const i of unusedSet) {
        const d2 = dist2(centers[curIdx], centers[i]);
        const curTile = tiles[curIdx];
        const nextTile = tiles[i];
        const isAdjacent = areTilesAdjacent(curTile, nextTile, k);
        if (isAdjacent && d2 < bestD2) { bestD2 = d2; best = i; }
      }
      if (best != null) {
        console.log(`No adjacent tile found within diagonal distance. Falling back to closest adjacent tile at (${tiles[best].r}, ${tiles[best].c})`);
      } else {
        console.log(`No adjacent tile found even in fallback for diagonal rule. Stopping selection.`);
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


function orderTilesWithNextRule(tiles, k, nextRule, startRule = "topleft", maxAngleDiff = Infinity, grid, customStartTile = null, startAngle = null) {
    if (tiles.length <= 1) return tiles.slice();

    const centers = tiles.map(t => tileCenter(t, k));

    // pick start
    let startIdx = 0;
    if (startRule === "topleft") {
      console.log(`Top-Left selection - All tiles in solution: ${tiles.map((t, idx) => `[${idx}]:(${t.r},${t.c})`).join(" ")}`);
      for (let i = 1; i < tiles.length; i++) {
        if (tiles[i].r < tiles[startIdx].r || (tiles[i].r === tiles[startIdx].r && tiles[i].c < tiles[startIdx].c)) {
          console.log(`  Updating startIdx from ${startIdx}:(${tiles[startIdx].r},${tiles[startIdx].c}) to ${i}:(${tiles[i].r},${tiles[i].c})`);
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
      // Custom 시작 타일은 이미 DFS에서 고정되어 있으므로, 정확히 일치하는 타일을 찾음
      let found = false;
      for (let i = 0; i < tiles.length; i++) {
        if (tiles[i].r === customStartTile.r && tiles[i].c === customStartTile.c) {
          startIdx = i;
          found = true;
          break;
        }
      }
      if (found) {
        console.log(`Custom start tile found in solution at exact position: (${tiles[startIdx].r}, ${tiles[startIdx].c})`);
      } else {
        console.log(`Warning: Custom start tile (${customStartTile.r}, ${customStartTile.c}) not found in solution. Using closest tile.`);
        // Fallback: 가장 가까운 타일 찾기
        let minDist = Infinity;
        for (let i = 0; i < tiles.length; i++) {
          const dist = Math.sqrt((tiles[i].r - customStartTile.r)**2 + (tiles[i].c - customStartTile.c)**2);
          if (dist < minDist) {
            minDist = dist;
            startIdx = i;
          }
        }
        console.log(`Closest tile in solution: (${tiles[startIdx].r}, ${tiles[startIdx].c})`);
      }
    } else if (typeof startRule === "function") {
      startIdx = startRule(tiles, centers);
    }

    console.log(`Starting tile selected: (${tiles[startIdx].r}, ${tiles[startIdx].c}) based on rule '${startRule}'`);

    const unused = new Set([...Array(tiles.length).keys()]);
    unused.delete(startIdx);

    const orderIdx = [startIdx];
    let cur = startIdx;
    let prevAngle = startAngle !== null ? startAngle : null;
    
    if (startAngle !== null) {
      console.log(`Initial direction (prevAngle) set to: ${startAngle}° ${arrowFromAngle(startAngle)}`);
    }

    while (unused.size) {
      const nxt = nextRule(cur, prevAngle, centers, unused, k, tiles);
      if (nxt == null) {
        console.log(`중단됐습니다. 타일 ${orderIdx.length}. No suitable next tile found. ${unused.size} tiles remain unvisited.`);
        break;
      }

      const newAngle = angleDegCart(centers[cur], centers[nxt]);
      if (prevAngle !== null && angleDiff(prevAngle, newAngle) > maxAngleDiff) {
        console.log(`중단됐습니다. 타일 ${orderIdx.length} due to angle difference (${angleDiff(prevAngle, newAngle).toFixed(1)}°) exceeding max allowed (${maxAngleDiff}°). ${unused.size} tiles remain unvisited.`);
        break;
      }

      prevAngle = newAngle;
      orderIdx.push(nxt);
      unused.delete(nxt);
      cur = nxt;
    }

    if (unused.size > 0) {
      console.log(`Warning: 모든 타일이 처리되지 못했음. Only ${orderIdx.length} out of ${tiles.length} tiles were visited due to constraints.`);
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

function resumeTileOrdering(state, newMaxAngleDiff = null) {
  let { orderIdx, unused, cur, prevAngle, centers, tiles, k, nextRule, maxAngleDiff, grid } = state;
  if (newMaxAngleDiff !== null) {
    maxAngleDiff = newMaxAngleDiff;
    console.log(`Resuming tile ordering with new max angle difference: ${maxAngleDiff}°`);
  } else {
    console.log(`Resuming tile ordering with original max angle difference: ${maxAngleDiff}°`);
  }

  function askUserForNextTile(candidates, cur, prevAngle, centers, k) {
    return new Promise((resolve) => {
      console.log(`\nCurrent tile position: (${tiles[cur].r}, ${tiles[cur].c})`);
      console.log('Available tiles around the current position:');
      candidates.forEach((cand, index) => {
        const tile = tiles[cand.i];
        const dist = tileDist(centers[cur], centers[cand.i], k);
        const ang = angleDegCart(centers[cur], centers[cand.i]);
        const turn = prevAngle == null ? 0 : angleDiff(prevAngle, ang);
        console.log(`  ${index + 1}. Tile at (${tile.r}, ${tile.c}) - Distance: ${dist.toFixed(2)} tile units, Angle: ${ang.toFixed(1)}°, Turn: ${turn.toFixed(1)}°`);
      });
      showInputSection(true);
      updateTileOptions(candidates, tiles, cur, centers, k, prevAngle);
      userInputResolver = (value) => { showInputSection(false); resolve(value); };
    });
  }

  function getTileCandidates(cur, unused, centers, k) {
    const candidates = [];
    for (const i of unused) {
      const dist = tileDist(centers[cur], centers[i], k);
      candidates.push({ i, dist });
    }
    candidates.sort((a, b) => a.dist - b.dist);
    return candidates;
  }

  async function processNextTile() {
    while (unused.size) {
      const candidates = getTileCandidates(cur, unused, centers, k);
      if (candidates.length === 0) {
        console.log(`Stopped resuming at tile ${orderIdx.length}. No suitable next tile found. ${unused.size} tiles remain unvisited.`);
        break;
      }

      const answer = await askUserForNextTile(candidates, cur, prevAngle, centers, k);
      let nxt = null;

      if (String(answer).toLowerCase() === 'stop') {
        console.log(`User stopped resuming at tile ${orderIdx.length}. ${unused.size} tiles remain unvisited.`);
        generateAndCopyResultImage(grid, tiles, orderIdx, k); // why: 상태에 저장한 grid 사용
        break;
      } else if (String(answer).toLowerCase() === 'auto') {
        console.log('Switching to automatic selection using default rule.');
        nxt = nextRule(cur, prevAngle, centers, unused, k);
      } else {
        const choice = parseInt(answer, 10);
        if (!Number.isNaN(choice) && choice >= 0 && choice < candidates.length) {
          nxt = candidates[choice].i;
          console.log(`User selected tile at (${tiles[nxt].r}, ${tiles[nxt].c}).`);
        } else {
          console.log(`Invalid selection. Using default rule to select next tile.`);
          nxt = nextRule(cur, prevAngle, centers, unused, k);
        }
      }

      if (nxt == null) {
        console.log(`Stopped resuming at tile ${orderIdx.length}. No suitable next tile found. ${unused.size} tiles remain unvisited.`);
        break;
      }

      const newAngle = angleDegCart(centers[cur], centers[nxt]);
      if (prevAngle !== null && angleDiff(prevAngle, newAngle) > maxAngleDiff) {
        console.log(`Stopped resuming at tile ${orderIdx.length} due to angle difference (${angleDiff(prevAngle, newAngle).toFixed(1)}°) exceeding max allowed (${maxAngleDiff}°). ${unused.size} tiles remain unvisited.`);
        break;
      }

      prevAngle = newAngle;
      orderIdx.push(nxt);
      unused.delete(nxt);
      cur = nxt;

      const currentOrderedTiles = orderIdx.map(i => tiles[i]);
      console.log('\nCurrent ordered tile path after selecting tile ' + orderIdx.length + ':');
      printPlacementAscii(grid, currentOrderedTiles, k, '-- Current Visual (Tile ' + orderIdx.length + ') --'); // why: 전역 grid 금지
    }

    if (unused.size > 0) {
      console.log(`Warning: Not all tiles were ordered after resuming. Only ${orderIdx.length} out of ${tiles.length} tiles were visited due to constraints.`);
    } else {
      console.log(`Successfully ordered all tiles after resuming. Total tiles ordered: ${orderIdx.length}.`);
    }

    const finalOrderedTiles = orderIdx.map(i => tiles[i]);
    console.log('\nFinal ordered tile path visualization:');
    printPlacementAscii(grid, finalOrderedTiles, k, '-- Final Visual after Resuming --');

    return {
      orderedTiles: finalOrderedTiles,
      state: { orderIdx, unused, cur, prevAngle, centers, tiles, k, nextRule, maxAngleDiff, grid }
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
  
  /* ------------------ 주요 부분 (maximize covered orange) ------------ */
function printBestTilePlacements(grid, k = 2, limit = 4, opts = {}) {
  const {
    showVisual = true,
    showDirections = true,
    order = "weighted",
    weighted = { wDist: 1.0, wTurn: 2.5 },
    maxAngleDiff = 60,
    iterationLimit = 100000,
    depthLimit = 50,
    startRule = "topleft",
    customStartTile = null,
    startAngle = null
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
    return [];
  }

  // Precompute all possible k×k placements (not necessarily fully inside orange cells)
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
      // 타일의 모든 셀이 오렌지여야만 배치 가능 (k×k 타일의 경우 k*k개 모두 오렌지)
      if (orangeCount === k * k) placements.push({ r, c, mask: m });
    }
  }

  if (placements.length === 0) {
    console.log(`No ${k}×${k} placements with orange cells.`);
    console.log(`Orange cells: ${totalOrange}`);
    return [];
  }

  // cell -> placements covering it
  const coverMap = new Map();
  for (let i = 0; i < H * W; i++) {
    if ((orangeMask & bitAt(i)) !== 0n) coverMap.set(i, []);
  }
  placements.forEach((p, pi) => {
    let m = p.mask;
    while (m) {
      const b = lowestBit(m);
      const idx = bitToIndex(b);
      if (coverMap.has(idx)) coverMap.get(idx).push(pi);
      m ^= b;
    }
  });

  // Custom 시작 타일 처리: 미리 고정된 타일로 설정
  let initialCovered = 0n;
  let initialTiles = [];
  
  if (startRule === "custom" && customStartTile) {
    const { r: customR, c: customC } = customStartTile;
    console.log(`Custom start tile specified at (${customR}, ${customC}). This tile will be fixed.`);
    
    // Custom 좌표에 해당하는 타일의 마스크 생성
    let customMask = 0n;
    for (let dr = 0; dr < k; dr++) {
      for (let dc = 0; dc < k; dc++) {
        const rr = customR + dr;
        const cc = customC + dc;
        if (rr >= 0 && rr < H && cc >= 0 && cc < W) {
          customMask |= bitAt(rr * W + cc);
        }
      }
    }
    
    // 초기 상태로 설정
    initialCovered = customMask;
    initialTiles = [{ r: customR, c: customC }];
    console.log(`Fixed custom tile covers ${popcount(customMask)} cells.`);
  } else if (startRule === "topleft" || startRule === "topright") {
    // Top-Left 또는 Top-Right 모드: 가장 Top-Left/Right 위치의 타일을 미리 고정
    let selectedPlacement = null;
    
    if (startRule === "topleft") {
      // 가장 Top-Left 타일 찾기 (row 우선, 같으면 col 우선)
      for (const p of placements) {
        if (!selectedPlacement || 
            p.r < selectedPlacement.r || 
            (p.r === selectedPlacement.r && p.c < selectedPlacement.c)) {
          selectedPlacement = p;
        }
      }
    } else if (startRule === "topright") {
      // 가장 Top-Right 타일 찾기 (row 우선, 같으면 col 역순)
      for (const p of placements) {
        if (!selectedPlacement || 
            p.r < selectedPlacement.r || 
            (p.r === selectedPlacement.r && p.c > selectedPlacement.c)) {
          selectedPlacement = p;
        }
      }
    }
    
    if (selectedPlacement) {
      console.log(`${startRule === "topleft" ? "Top-Left" : "Top-Right"} start tile auto-selected at (${selectedPlacement.r}, ${selectedPlacement.c}). This tile will be fixed.`);
      initialCovered = selectedPlacement.mask;
      initialTiles = [{ r: selectedPlacement.r, c: selectedPlacement.c }];
      console.log(`Fixed start tile covers ${popcount(initialCovered)} cells.`);
    }
  }

  let bestCovered = -1;
  const bestSolutions = []; // {sig, tiles, coveredCount, leftoverCount, coveredMask, angles, deltas, orderedTiles}

  const memo = new Map();
  const keyOf = (covered, skipped) => `${covered.toString(16)}|${skipped.toString(16)}`;

  const tryRecordSolution = (covered, tiles) => {
    const coveredCount = popcount(covered);
    if (coveredCount < bestCovered) return;

    if (coveredCount > bestCovered) {
      bestCovered = coveredCount;
      bestSolutions.length = 0;
      console.log(`New best coverage found: ${bestCovered} cells with ${tiles.length} tiles`);
    }

    const sig = tiles.map(t => `${t.r},${t.c}`).join(";");
    if (!bestSolutions.some(s => s.sig === sig)) {
      console.log(`Recording solution: ${tiles.length} tiles covering ${coveredCount} cells: ${tiles.map(t => `(${t.r},${t.c})`).join(" ")}`);
      bestSolutions.push({
        sig,
        tiles: tiles.slice(),
        coveredCount,
        leftoverCount: totalOrange - coveredCount,
        coveredMask: covered
      });
    }
  };

  let iterationCount = 0;
  function dfs(covered, skipped, tiles, depth = 0) {
    iterationCount++;
    if (iterationCount > iterationLimit) {
      console.log(`Iteration limit of ${iterationLimit} reached. Stopping search.`);
      return;
    }
    const remaining = orangeMask & ~(covered | skipped);

    // Upper bound: we cannot cover more than remaining orange cells
    const upperBound = popcount(covered) + popcount(remaining);
    if (upperBound < bestCovered) return;

    const stateKey = keyOf(covered, skipped);
    const curCoveredCount = popcount(covered);
    const prevBestHere = memo.get(stateKey);
    if (prevBestHere !== undefined && prevBestHere >= curCoveredCount) return;
    memo.set(stateKey, curCoveredCount);

    if (remaining === 0n) {
      tryRecordSolution(covered, tiles);
      return;
    }

    // Depth limit check
    if (depth >= depthLimit) {
      if (iterationCount < 100) {
        console.log(`Depth limit of ${depthLimit} reached at depth ${depth}. Stopping this branch.`);
      }
      return;
    }

    const cellBit = lowestBit(remaining);
    const cellIdx = bitToIndex(cellBit);

    // Branch 1: skip this orange cell (leave as gap)
    dfs(covered, skipped | cellBit, tiles, depth + 1);

    // Branch 2: place a tile that covers this cell
    const cand = coverMap.get(cellIdx) || [];
    for (const pi of cand) {
      const pm = placements[pi].mask;
      if ((pm & (covered | skipped)) !== 0n) continue;

      const newTile = { r: placements[pi].r, c: placements[pi].c };
      
      // 인접성 체크: 첫 타일이거나, 기존 타일 중 하나와 인접해야 함
      let isAdjacentToExisting = tiles.length === 0; // 첫 타일은 항상 허용
      if (!isAdjacentToExisting) {
        for (const existingTile of tiles) {
          if (areTilesAdjacent(existingTile, newTile, k)) {
            isAdjacentToExisting = true;
            break;
          }
        }
      }
      
      if (!isAdjacentToExisting) continue; // 인접하지 않으면 스킵

      tiles.push(newTile);
      dfs(covered | pm, skipped, tiles, depth + 1);
      tiles.pop();

      if (bestCovered === totalOrange && bestSolutions.length >= limit) return;
    }
  }

  console.log(`Starting DFS with iteration limit: ${iterationLimit}, depth limit: ${depthLimit}`);
  if (initialTiles.length > 0) {
    console.log(`DFS starting with ${initialTiles.length} pre-fixed tile(s): ${initialTiles.map(t => `(${t.r},${t.c})`).join(", ")}`);
    console.log(`Initial coverage: ${popcount(initialCovered)} cells`);
  }
  dfs(initialCovered, 0n, initialTiles.slice());
  console.log(`DFS completed. Total iterations: ${iterationCount}`);

  bestSolutions.sort((a, b) => a.tiles.length - b.tiles.length);
  const out = bestSolutions.slice(0, limit);

  console.log(`k=${k} (tile ${k}×${k})`);
  console.log(`Orange cells: ${totalOrange}`);
  console.log(`Best covered: ${bestCovered} / leftover gaps: ${totalOrange - (bestCovered === -1 ? 0 : bestCovered)}`);
  console.log(`Showing ${out.length} solution(s):`);
  if (out.length === 0) {
    console.log(`No solutions found. Possible reasons: depth limit (${depthLimit}), iteration limit (${iterationLimit}), or no valid tile placements.`);
    console.log(`Valid placements found: ${placements.length}`);
    if (placements.length > 0) {
      console.log(`Sample placements (up to 5):`, placements.slice(0, 5).map(p => `(${p.r},${p.c})`).join(', '));
    }
  }

  // choose ordering rule
  let nextRule = null;
  if (order === "nearest") nextRule = nextByNearest;
  else if (order === "minturn") nextRule = nextByMinTurn;
  else if (order === "weighted") nextRule = makeNextByWeightedWithMaxDist(weighted);
  // else if (order === "weighted") nextRule = makeNextPreferAngleIfDiagonal({
  //   diagTileDist: Math.SQRT2, // 대각선 인접까지 포함
  // });

  out.forEach((s, i) => {
    console.log(`\n[Solution ${i + 1}] covered=${s.coveredCount}, leftover=${s.leftoverCount}, tiles=${s.tiles.length}`);
    console.log("All tile coords in solution (r,c):", s.tiles.map(t => `(${t.r},${t.c})`).join(" "));

    let tilesToShow = s.tiles;

    if (order === "topleft") {
      tilesToShow = [...s.tiles].sort((a, b) => (a.r - b.r) || (a.c - b.c));
    } else if ((order === "nearest" || order === "minturn" || order === "weighted") && nextRule) {
      const result = orderTilesWithNextRule(s.tiles, k, nextRule, startRule, maxAngleDiff, grid, customStartTile, startAngle);
      tilesToShow = result.orderedTiles;
      s.orderingState = result.state; // grid is now included in result.state
    }

    if (showVisual) {
      if (Array.isArray(grid) && grid.length > 0 && Array.isArray(grid[0])) {
        printPlacementAscii(grid, tilesToShow, k, `-- Visual ${i + 1} (order=${order}) --`);
      } else {
        console.error("Cannot render visual: grid is invalid or undefined.");
      }
    }

    if (showDirections) {
      const { angles, deltas } = computeTileDirectionsAndDeltas(tilesToShow, k);
      printTileDirectionsAndDeltas(tilesToShow, k, `-- Directions & ΔAngles ${i + 1} (order=${order}) --`);
      s.angles = angles;
      s.deltas = deltas;
      s.orderedTiles = tilesToShow;
    }
  });

  return out;
}
  
  /* ------------------------- Demo run ------------------------- */
  // 초기 실행은 하지 않음. 이미지 로드 후 버튼 클릭 시 실행
  // 2×2, best solutions 1개, 경로 순서는 weighted(거리+회전) 기반
  // 사용자가 이미지를 로드한 후 버튼 클릭 시 실행되도록 blockMove.html에서 처리

  // 3×3도 테스트하려면 아래 주석 해제:
  // printBestTilePlacements(grid, 3, 4, { showVisual: true, showDirections: true, order: "weighted" });
  