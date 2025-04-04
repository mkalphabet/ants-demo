// Configuration Object for Simulation Parameters and State
const simulationConfig = {
  // Simulation Parameters
  NUM_ANTS: 600,
  ANT_SPEED: 1, // Grid cells per update step (can be fractional)
  EVAPORATION_RATE: 0.005, // Pheromone decay per frame (multiplicative)
  DEPOSITION_RATE_EXPLORE: 15, // Amount deposited by searching ants
  DEPOSITION_RATE_RETURN: 15, // Amount deposited by returning ants
  PHEROMONE_MAX: 255, // Max strength for visualization mapping
  PHEROMONE_DURATION: 5000, // Max "charge" in frames/updates for depositing return pheromone
  SENSE_RADIUS: 1.1, // How many cells away ants can sense pheromones (1 = immediate neighbors)
  GOAL_SENSE_RADIUS: 2,
  SENSE_ANGLE: Math.PI / 2.5, // Field of view for sensing (~72 degrees)
  TURN_ANGLE: Math.PI / 6, // How much an ant can turn per step (~30 degrees)
  FOLLOW_STRENGTH_WEIGHT: 5, // How strongly ants follow pheromones vs random walk
  RANDOM_TURN_CHANCE: 0.1, // Chance to make a random turn even when following
  FOOD_DETECTION_RADIUS: 1, // How close ants need to be to detect food (grid cells)
  COLONY_DETECTION_RADIUS: 1, // How close ants need to be to detect food (grid cells)
  ANT_HISTORY_LENGTH: 20, // How many steps an ant remembers to avoid loops

  // Maze and Grid Settings
  GRID_COLS: 20,
  GRID_ROWS: 16,
  CELL_SIZE: undefined, // Calculated in setup
  maze: [], // 0 = path, 1 = wall - Initialized in setup/createPredefinedMaze

  // Pheromone Grids
  explorePheromones: undefined, // Initialized in setup
  returnPheromones: undefined, // Initialized in setup

  // Simulation Objects/State
  ants: [],
  colonyPos: undefined, // Set in setup
  foodPos: undefined,   // Set in setup
  foodFoundCount: 0,

  // Performance related (might not need testing directly)
  lastAntSpawnTime: 0,
  SPAWN_INTERVAL: 100,

  // Colors (Not part of config needed for logic testing)
};

// --- Colors (kept separate as they don't affect logic) ---
let COLOR_BACKGROUND;
let COLOR_WALL;
let COLOR_PATH;
let COLOR_COLONY;
let COLOR_FOOD;
let COLOR_ANT_SEARCH;
let COLOR_ANT_RETURN;
let COLOR_PHEROMONE_EXPLORE;
let COLOR_PHEROMONE_RETURN;

// ==================================
//         p5.js Functions
// ==================================

function setup() {
  // Generate the maze first to get final dimensions
  const mazeResult = generateMaze(simulationConfig.GRID_COLS, simulationConfig.GRID_ROWS);
  simulationConfig.maze = mazeResult.grid;
  simulationConfig.GRID_COLS = mazeResult.finalCols; // Update config with actual dimensions used
  simulationConfig.GRID_ROWS = mazeResult.finalRows;

  // Calculate cell size and canvas dimensions based on FINAL grid size
  let aspectRatio = simulationConfig.GRID_COLS / simulationConfig.GRID_ROWS;
  let canvasWidth = windowWidth * 0.9;
  let canvasHeight = windowHeight * 0.9;
  if (canvasWidth / canvasHeight > aspectRatio) {
    canvasHeight = windowHeight * 0.9;
    canvasWidth = canvasHeight * aspectRatio;
  } else {
    canvasWidth = windowWidth * 0.9;
    canvasHeight = canvasWidth / aspectRatio;
  }
  // Assign calculated CELL_SIZE to the config
  simulationConfig.CELL_SIZE = floor(canvasWidth / simulationConfig.GRID_COLS);
  // Recalculate canvas size based on integer cell size
  canvasWidth = simulationConfig.CELL_SIZE * simulationConfig.GRID_COLS;
  canvasHeight = simulationConfig.CELL_SIZE * simulationConfig.GRID_ROWS;

  createCanvas(canvasWidth, canvasHeight);
  pixelDensity(1); // Ensure consistent pixel density

  // Initialize Colors (using global p5 color function)
  COLOR_BACKGROUND = color(51);
  COLOR_WALL = color(0);
  COLOR_PATH = color(70);
  COLOR_COLONY = color(0, 0, 255, 200); // Blue
  COLOR_FOOD = color(255, 0, 0, 200); // Red
  COLOR_ANT_SEARCH = color(0, 255, 0, 220); // Bright Green
  COLOR_ANT_RETURN = color(255, 255, 0, 220); // Yellow
  COLOR_PHEROMONE_EXPLORE = color(0, 150, 255, 180); // Light Blue
  COLOR_PHEROMONE_RETURN = color(255, 100, 0, 180); // Orange

  // Maze is already generated and assigned to simulationConfig.maze above
  // createPredefinedMaze(); // No longer needed

  // Initialize Pheromone Grids using FINAL config dimensions
  simulationConfig.explorePheromones = createGrid(simulationConfig.GRID_COLS, simulationConfig.GRID_ROWS, 0);
  simulationConfig.returnPheromones = createGrid(simulationConfig.GRID_COLS, simulationConfig.GRID_ROWS, 0);

  // Set Colony and Food Positions using config dimensions
  simulationConfig.colonyPos = findValidPosition(1, 1);
  simulationConfig.foodPos = findValidPosition(simulationConfig.GRID_COLS - 2, simulationConfig.GRID_ROWS - 2);

  if (!simulationConfig.colonyPos || !simulationConfig.foodPos) {
    console.error("Could not place colony or food on a valid path!");
    noLoop();
    return;
  }
  console.log(`Colony at: ${simulationConfig.colonyPos.x}, ${simulationConfig.colonyPos.y}`);
  console.log(`Food at: ${simulationConfig.foodPos.x}, ${simulationConfig.foodPos.y}`);

  // Initialize Ants at the Colony
  spawnInitialAnts();
}

function draw() {
  background(COLOR_BACKGROUND);

  updatePheromones();    // Uses simulationConfig internally now
  drawPheromones();      // Uses simulationConfig internally now
  drawMaze();            // Uses simulationConfig internally now
  drawColony();          // Uses simulationConfig internally now
  drawFood();            // Uses simulationConfig internally now
  updateAndDrawAnts();   // Uses simulationConfig internally now
  spawnNewAnts();        // Uses simulationConfig internally now

  // Display Info
  fill(255);
  noStroke();
  textSize(14);
  textAlign(LEFT, TOP);
  text(`Ants: ${simulationConfig.ants.length}`, 10, 10);
  text(`Food Found: ${simulationConfig.foodFoundCount}`, 10, 30);
}

// ==================================
//      Initialization Functions
// ==================================

function createGrid(cols, rows, defaultValue = 0) {
  // This function remains generic
  let grid = new Array(cols);
  for (let i = 0; i < cols; i++) {
    grid[i] = new Array(rows);
    for (let j = 0; j < rows; j++) {
      grid[i][j] = defaultValue;
    }
  }
  return grid;
}

// ==================================
//      Maze Generation (Recursive Backtracker)
// ==================================
function generateMaze(cols, rows) {
  // Ensure odd dimensions for easier wall handling between cells
  // Use local variables for calculation to avoid modifying config prematurely
  let mazeCols = cols % 2 === 0 ? cols - 1 : cols;
  let mazeRows = rows % 2 === 0 ? rows - 1 : rows;
  if (mazeCols < 3) mazeCols = 3; // Ensure minimum size
  if (mazeRows < 3) mazeRows = 3;

  let maze = createGrid(mazeCols, mazeRows, 1); // Start with all walls
  let stack = [];
  // Keep track of visited cells for the generation algorithm itself
  let visited = createGrid(mazeCols, mazeRows, false);

  // Choose a random starting cell (must be odd coordinates within the maze grid, excluding borders)
  // Max random index needed is (dimension - 1) / 2 - 1
  // So the argument to random should be (dimension - 1) / 2
  let startX = floor(random((mazeCols - 1) / 2)) * 2 + 1;
  let startY = floor(random((mazeRows - 1) / 2)) * 2 + 1;
  let current = { x: startX, y: startY };

  // Ensure start position is valid before accessing visited grid
  if (startX < 0 || startX >= mazeCols || startY < 0 || startY >= mazeRows) {
      console.error("Invalid start position calculated in generateMaze:", startX, startY, "for dimensions", mazeCols, mazeRows);
      // Fallback to a safe default if calculation somehow failed
      startX = 1;
      startY = 1;
      current = { x: startX, y: startY };
  }


  visited[current.x][current.y] = true;
  maze[current.x][current.y] = 0; // Mark starting cell as path
  stack.push(current);

  while (stack.length > 0) {
    current = stack[stack.length - 1]; // Peek at the top of the stack
    let neighbors = [];

    // Check potential neighbors (2 cells away in cardinal directions)
    let potentialNeighbors = [
      { x: current.x, y: current.y - 2 }, // North
      { x: current.x + 2, y: current.y }, // East
      { x: current.x, y: current.y + 2 }, // South
      { x: current.x - 2, y: current.y }  // West
    ];

    // Filter valid, unvisited neighbors
    for (let n of potentialNeighbors) {
      // Check bounds (greater than 0 and less than mazeCols/Rows - 1 to stay within walls)
      if (n.x > 0 && n.x < mazeCols - 1 && n.y > 0 && n.y < mazeRows - 1 && !visited[n.x][n.y]) {
        neighbors.push(n);
      }
    }

    if (neighbors.length > 0) {
      // Choose a random neighbor
      let chosen = random(neighbors);

      // Push the current cell to the stack
      // (We push current *before* moving to chosen, standard for this algorithm)
      // stack.push(current); // Already peeked, only push chosen when moving

      // Remove the wall between the current cell and the chosen cell
      let wallX = current.x + (chosen.x - current.x) / 2;
      let wallY = current.y + (chosen.y - current.y) / 2;
      maze[wallX][wallY] = 0; // Carve the path

      // Move to the chosen cell
      current = chosen; // Update current for the next iteration's check
      visited[current.x][current.y] = true;
      maze[current.x][current.y] = 0; // Mark chosen cell as path
      stack.push(current); // Push the new current cell onto the stack

    } else {
      // If no unvisited neighbors, backtrack
      stack.pop();
    }
  }

  // Ensure outer border is wall (redundant as we start with all walls and stay within bounds)
  // for (let i = 0; i < mazeCols; i++) {
  //   maze[i][0] = 1;
  //   maze[i][mazeRows - 1] = 1;
  // }
  // for (let j = 0; j < mazeRows; j++) {
  //   maze[0][j] = 1;
  //   maze[mazeCols - 1][j] = 1;
  // }

  // Ensure colony and potential food start positions are open AFTER generation
  // These might be overwritten if they were walls initially, so force them open.
  maze[1][1] = 0;
  if (mazeCols > 2 && mazeRows > 2) { // Check bounds before accessing
      maze[mazeCols - 2][mazeRows - 2] = 0;
  }

  // Return the generated maze and the dimensions used
  return { grid: maze, finalCols: mazeCols, finalRows: mazeRows };
}


function createPredefinedMaze() {
  // Uses config for dimensions, assigns to config.maze
  // THIS FUNCTION IS NO LONGER USED, replaced by generateMaze
  simulationConfig.maze = createGrid(simulationConfig.GRID_COLS, simulationConfig.GRID_ROWS, 0);
  const maze = simulationConfig.maze; // local alias for convenience
  const cols = simulationConfig.GRID_COLS;
  const rows = simulationConfig.GRID_ROWS;

  // Outer walls
  for (let i = 0; i < cols; i++) {
    maze[i][0] = 1;
    maze[i][rows - 1] = 1;
  }
  for (let j = 0; j < rows; j++) {
    maze[0][j] = 1;
    maze[cols - 1][j] = 1;
  }

  // Simple internal walls (using cols/rows)
  for (let i = 5; i < cols - 5; i++) {
    if (i % 8 < 4) { maze[i][floor(rows * 0.3)] = 1; }
  }
  for (let i = 5; i < cols - 5; i++) {
    if ((i + 4) % 8 < 4) { maze[i][floor(rows * 0.7)] = 1; }
  }
  for (let j = 5; j < rows - 5; j++) {
    if (j % 6 < 3 && j < floor(rows * 0.7) - 2) { maze[floor(cols * 0.5)][j] = 1; }
  }

  maze[1][1] = 0;
  maze[cols - 2][rows - 2] = 0;
}

function findValidPosition(targetX, targetY) {
  // Uses config for dimensions and maze
  const cols = simulationConfig.GRID_COLS;
  const rows = simulationConfig.GRID_ROWS;
  const maze = simulationConfig.maze;

  targetX = constrain(targetX, 0, cols - 1);
  targetY = constrain(targetY, 0, rows - 1);

  if (maze[targetX][targetY] === 0) return createVector(targetX, targetY);

  // Spiral search outwards
  for (let radius = 1; radius < max(cols, rows); radius++) {
    for (let i = -radius; i <= radius; i++) {
      for (let j = -radius; j <= radius; j++) {
        if (abs(i) !== radius && abs(j) !== radius) continue;
        let checkX = targetX + i;
        let checkY = targetY + j;
        // Use isValidGridPos which also uses config internally
        if (isValidGridPos(checkX, checkY) && maze[checkX][checkY] === 0) {
          return createVector(checkX, checkY);
        }
      }
    }
  }
  return null;
}

function spawnInitialAnts() {
  simulationConfig.ants = [];
  for (let i = 0; i < (simulationConfig.NUM_ANTS / 10); i++) {
    // Pass colony pos from config
    simulationConfig.ants.push(new Ant(simulationConfig.colonyPos.x, simulationConfig.colonyPos.y));
  }
  simulationConfig.lastAntSpawnTime = millis();
}

function spawnNewAnts() {
  let now = millis();
  if (simulationConfig.ants.length < simulationConfig.NUM_ANTS && now - simulationConfig.lastAntSpawnTime > simulationConfig.SPAWN_INTERVAL) {
    simulationConfig.ants.push(new Ant(simulationConfig.colonyPos.x, simulationConfig.colonyPos.y));
    simulationConfig.lastAntSpawnTime = now;
  }
}

// ==================================
//      Drawing Functions
// ==================================

function drawMaze() {
  noStroke();
  const maze = simulationConfig.maze;
  const cols = simulationConfig.GRID_COLS;
  const rows = simulationConfig.GRID_ROWS;
  const cellSize = simulationConfig.CELL_SIZE;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (maze[i][j] === 1) {
        fill(COLOR_WALL); // Color is still global for now
        rect(i * cellSize, j * cellSize, cellSize, cellSize);
      }
    }
  }
}

function drawPheromones() {
  noStroke();
  const cols = simulationConfig.GRID_COLS;
  const rows = simulationConfig.GRID_ROWS;
  const explore = simulationConfig.explorePheromones;
  const returnPher = simulationConfig.returnPheromones;
  const maxPher = simulationConfig.PHEROMONE_MAX;
  const cellSize = simulationConfig.CELL_SIZE;

  // Need COLOR_PHEROMONE_EXPLORE and COLOR_PHEROMONE_RETURN (global p5 colors)
  // Assuming these colors are initialized in setup()
  const colorExplore = COLOR_PHEROMONE_EXPLORE ?? color(0, 150, 255, 180);
  const colorReturn = COLOR_PHEROMONE_RETURN ?? color(255, 100, 0, 180);

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if (explore[i][j] > 0.1) {
        let alpha = map(explore[i][j], 0, maxPher, 0, 255);
        fill(red(colorExplore), green(colorExplore), blue(colorExplore), alpha);
        rect(i * cellSize, j * cellSize, cellSize, cellSize);
      }
      if (returnPher[i][j] > 0.1) {
        let alpha = map(returnPher[i][j], 0, maxPher, 0, 255);
        fill(red(colorReturn), green(colorReturn), blue(colorReturn), alpha);
        rect(i * cellSize, j * cellSize, cellSize, cellSize);
      }
    }
  }
}

function drawColony() {
  fill(COLOR_COLONY); // Global color
  noStroke();
  const pos = simulationConfig.colonyPos;
  const cellSize = simulationConfig.CELL_SIZE;
  ellipse((pos.x + 0.5) * cellSize, (pos.y + 0.5) * cellSize, cellSize * 1.5, cellSize * 1.5);
}

function drawFood() {
  fill(COLOR_FOOD); // Global color
  noStroke();
  const pos = simulationConfig.foodPos;
  const cellSize = simulationConfig.CELL_SIZE;
  ellipse((pos.x + 0.5) * cellSize, (pos.y + 0.5) * cellSize, cellSize * 1.5, cellSize * 1.5);
}

function updateAndDrawAnts() {
  // Access ants array from config
  for (let i = simulationConfig.ants.length - 1; i >= 0; i--) {
    simulationConfig.ants[i].update(); // update uses config internally
    simulationConfig.ants[i].display(); // display uses config internally
  }
}

// ==================================
//      Simulation Update Functions
// ==================================

function updatePheromones() {
  const cols = simulationConfig.GRID_COLS;
  const rows = simulationConfig.GRID_ROWS;
  const evapRate = simulationConfig.EVAPORATION_RATE;
  const explore = simulationConfig.explorePheromones;
  const returnPher = simulationConfig.returnPheromones;

  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      explore[i][j] *= 1.0 - evapRate;
      returnPher[i][j] *= 1.0 - evapRate;
      if (explore[i][j] < 0.01) explore[i][j] = 0;
      if (returnPher[i][j] < 0.01) returnPher[i][j] = 0;
    }
  }
}

// ==================================
//      Utility Functions
// ==================================

function isValidGridPos(x, y) {
  // Uses config
  return x >= 0 && x < simulationConfig.GRID_COLS && y >= 0 && y < simulationConfig.GRID_ROWS;
}

function gridToPixel(gridX, gridY) {
  // Uses config
  return createVector((gridX + 0.5) * simulationConfig.CELL_SIZE, (gridY + 0.5) * simulationConfig.CELL_SIZE);
}

function pixelToGrid(pixelX, pixelY) {
  // Uses config
  return createVector(floor(pixelX / simulationConfig.CELL_SIZE), floor(pixelY / simulationConfig.CELL_SIZE));
}

// ==================================
//          Ant Class
// ==================================
class Ant {
  constructor(gridX, gridY) {
    // Uses config for CELL_SIZE, ANT_SPEED, PHEROMONE_DURATION
    this.pos = gridToPixel(gridX, gridY); // gridToPixel uses config.CELL_SIZE
    this.vel = p5.Vector.random2D().mult(simulationConfig.ANT_SPEED);
    this.state = "searching";
    this.gridPos = createVector(gridX, gridY);
    this.history = [];
    this.charge = simulationConfig.PHEROMONE_DURATION;
  }

  update() {
    this.updateGridPos(); // Uses config.GRID_COLS, GRID_ROWS, CELL_SIZE via pixelToGrid
    this.checkEnvironment(); // Uses config.foodPos, colonyPos, DETECTION_RADIUS, PHEROMONE_DURATION, ANT_SPEED
    this.charge = max(0, this.charge - 1);
    this.move(); // Uses many config values (angles, speed, maze, etc.)
    this.depositPheromone(); // Uses config.explore/returnPheromones, charge, rates, max
    this.addToHistory(); // Uses config.ANT_HISTORY_LENGTH
  }

  updateGridPos() {
    // Uses config.GRID_COLS, GRID_ROWS, CELL_SIZE via pixelToGrid
    let currentGrid = pixelToGrid(this.pos.x, this.pos.y);
    this.gridPos.x = constrain(currentGrid.x, 0, simulationConfig.GRID_COLS - 1);
    this.gridPos.y = constrain(currentGrid.y, 0, simulationConfig.GRID_ROWS - 1);
  }

  addToHistory() {
    // Uses config.ANT_HISTORY_LENGTH
    if (this.history.length === 0 || this.history[this.history.length - 1].x !== this.gridPos.x || this.history[this.history.length - 1].y !== this.gridPos.y) {
      this.history.push({ x: this.gridPos.x, y: this.gridPos.y });
      if (this.history.length > simulationConfig.ANT_HISTORY_LENGTH) {
        this.history.shift();
      }
    }
  }

  wasRecentlyVisited(gridX, gridY) {
    for (let i = 0; i < this.history.length - 1; i++) {
      if (this.history[i].x === gridX && this.history[i].y === gridY) {
        return true;
      }
    }
    return false;
  }

  checkEnvironment() {
    // Uses config.foodPos, colonyPos, DETECTION_RADIUS, PHEROMONE_DURATION, ANT_SPEED
    if (this.state === "searching") {
      let distToFood = dist(this.gridPos.x, this.gridPos.y, simulationConfig.foodPos.x, simulationConfig.foodPos.y);
      if (distToFood <= simulationConfig.FOOD_DETECTION_RADIUS) {
        this.state = "returning";
        this.vel.mult(-1); // Keep basic reversal
        this.charge = simulationConfig.PHEROMONE_DURATION;
      }
    } else { // 'returning'
      let distToColony = dist(this.gridPos.x, this.gridPos.y, simulationConfig.colonyPos.x, simulationConfig.colonyPos.y);
      if (distToColony <= simulationConfig.COLONY_DETECTION_RADIUS) {
        this.state = "searching";
        this.vel = p5.Vector.random2D().mult(simulationConfig.ANT_SPEED);
        this.charge = simulationConfig.PHEROMONE_DURATION;
        simulationConfig.foodFoundCount++; // Update global count via config
      }
    }
  }

  move() {
    // Uses config: GOAL_SENSE_RADIUS, TURN_ANGLE, RANDOM_TURN_CHANCE, ANT_SPEED, maze, width, height
    let desiredAngle = this.senseAndDecideAngle(); // senseAndDecideAngle also uses config
    let desiredVel = p5.Vector.fromAngle(desiredAngle);
    let currentAngle = this.vel.heading();
    let angleDiff = desiredAngle - currentAngle;
    while (angleDiff > PI) angleDiff -= TWO_PI;
    while (angleDiff < -PI) angleDiff += TWO_PI;
    let turn = constrain(angleDiff, -simulationConfig.TURN_ANGLE, simulationConfig.TURN_ANGLE);
    let newAngle = currentAngle + turn;
    if (random(1) < simulationConfig.RANDOM_TURN_CHANCE) {
      newAngle += random(-simulationConfig.TURN_ANGLE * 0.5, simulationConfig.TURN_ANGLE * 0.5);
    }
    this.vel = p5.Vector.fromAngle(newAngle).mult(simulationConfig.ANT_SPEED);

    let nextPos = p5.Vector.add(this.pos, this.vel);
    let nextGrid = pixelToGrid(nextPos.x, nextPos.y); // pixelToGrid uses config

    // Need isValidGridPos which uses config
    if (isValidGridPos(nextGrid.x, nextGrid.y) && simulationConfig.maze[nextGrid.x][nextGrid.y] != 1) {
      // Valid move, update position
      this.pos = nextPos;
    } else {
      // Hit a wall or went out of bounds
      // Choose a new random direction instead of just reversing
      this.vel = p5.Vector.random2D().mult(simulationConfig.ANT_SPEED);
      // Optional: Could add a slight bias away from the wall, but random is simpler and often sufficient
    }

    // Constrain position to stay within canvas bounds (redundant if maze has outer walls, but safe)
    // Use width/height from config (assuming they are set appropriately if needed outside setup)
    // Or use p5 width/height if relying on canvas
    this.pos.x = constrain(this.pos.x, 0, width ?? simulationConfig.CELL_SIZE * simulationConfig.GRID_COLS); 
    this.pos.y = constrain(this.pos.y, 0, height ?? simulationConfig.CELL_SIZE * simulationConfig.GRID_ROWS);
  }

  senseAndDecideAngle() {
    // Uses config: foodPos, colonyPos, GOAL_SENSE_RADIUS, CELL_SIZE, SENSE_RADIUS, SENSE_ANGLE,
    // explore/returnPheromones, FOLLOW_STRENGTH_WEIGHT, PHEROMONE_MAX, TURN_ANGLE, maze
    let targetGridPos = (this.state === 'searching') ? simulationConfig.foodPos : simulationConfig.colonyPos;
    let distToTarget = dist(this.gridPos.x, this.gridPos.y, targetGridPos.x, targetGridPos.y);

    if (distToTarget <= simulationConfig.GOAL_SENSE_RADIUS) {
        let targetPixelPos = gridToPixel(targetGridPos.x, targetGridPos.y); // gridToPixel uses config
        let directAngle = atan2(targetPixelPos.y - this.pos.y, targetPixelPos.x - this.pos.x);
        return directAngle;
    }

    let currentAngle = this.vel.heading();
    let bestAngle = currentAngle;
    let maxPheromone = -1;

    let targetPheromones = this.state === "searching" ? simulationConfig.returnPheromones : simulationConfig.explorePheromones;

    for (let angleOffset = -simulationConfig.SENSE_ANGLE / 2; angleOffset <= simulationConfig.SENSE_ANGLE / 2; angleOffset += simulationConfig.SENSE_ANGLE / 4) {
      let checkAngle = currentAngle + angleOffset;
      let senseVec = p5.Vector.fromAngle(checkAngle);
      for (let distMultiplier = 0.5; distMultiplier <= 1.5; distMultiplier += 0.5) {
        let senseDist = simulationConfig.CELL_SIZE * simulationConfig.SENSE_RADIUS * distMultiplier;
        let checkPos = p5.Vector.add(this.pos, senseVec.mult(senseDist));
        let checkGrid = pixelToGrid(checkPos.x, checkPos.y); // pixelToGrid uses config

        // isValidGridPos and maze access use config
        if (isValidGridPos(checkGrid.x, checkGrid.y) && simulationConfig.maze[checkGrid.x][checkGrid.y] === 0 && !this.wasRecentlyVisited(checkGrid.x, checkGrid.y)) {
          let pheromoneLevel = targetPheromones[checkGrid.x][checkGrid.y];
          let weightedLevel = pheromoneLevel * simulationConfig.FOLLOW_STRENGTH_WEIGHT;
          weightedLevel += random(0, simulationConfig.PHEROMONE_MAX * 0.1);
          if (weightedLevel > maxPheromone) {
            maxPheromone = weightedLevel;
            bestAngle = checkAngle;
          }
        }
      }
    }

    if (maxPheromone <= 0) {
      bestAngle = currentAngle + random(-simulationConfig.TURN_ANGLE * 0.5, simulationConfig.TURN_ANGLE * 0.5);
    }
    return bestAngle;
  }

  depositPheromone() {
    // Uses config: PHEROMONE_DURATION, DEPOSITION_RATE_*, PHEROMONE_MAX, explore/returnPheromones
    let gridX = this.gridPos.x;
    let gridY = this.gridPos.y;
    if (this.charge <= 0) return;

    // isValidGridPos uses config
    if (isValidGridPos(gridX, gridY)) {
      if (this.state === "searching") {
        let currentDepositionRate = map(this.charge, 0, simulationConfig.PHEROMONE_DURATION, 0, simulationConfig.DEPOSITION_RATE_EXPLORE);
        currentDepositionRate = max(0, currentDepositionRate);
        simulationConfig.explorePheromones[gridX][gridY] += currentDepositionRate;
        simulationConfig.explorePheromones[gridX][gridY] = min(simulationConfig.explorePheromones[gridX][gridY], simulationConfig.PHEROMONE_MAX);
      } else { // returning
        let currentDepositionRate = map(this.charge, 0, simulationConfig.PHEROMONE_DURATION, 0, simulationConfig.DEPOSITION_RATE_RETURN);
        currentDepositionRate = max(0, currentDepositionRate);
        simulationConfig.returnPheromones[gridX][gridY] += currentDepositionRate;
        simulationConfig.returnPheromones[gridX][gridY] = min(simulationConfig.returnPheromones[gridX][gridY], simulationConfig.PHEROMONE_MAX);
      }
    }
  }

  display() {
    // Uses config: CELL_SIZE
    push();
    translate(this.pos.x, this.pos.y);
    rotate(this.vel.heading());
    // Colors are still global
    if (this.state === "searching") {
      fill(COLOR_ANT_SEARCH);
    } else {
      fill(COLOR_ANT_RETURN);
    }
    noStroke();
    let antSize = simulationConfig.CELL_SIZE * 0.6;
    triangle(antSize / 2, 0, -antSize / 2, -antSize / 3, -antSize / 2, antSize / 3);
    pop();
  }
}

// Node.js exports for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    simulationConfig, // Export the config object
    createGrid,
    findValidPosition,
    isValidGridPos,
    gridToPixel,
    pixelToGrid,
    Ant,
    // Export other functions if needed for testing (setup, draw, etc. are less common)
    setup, // Maybe useful if tests need to run setup
    createPredefinedMaze,
    updatePheromones,
    spawnInitialAnts,
    spawnNewAnts,
    generateMaze, // Export the new function
  };
}
