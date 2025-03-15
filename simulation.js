// Constants
const FPS = 50;
const FRAME_INTERVAL = 1000 / FPS;
const TIME_STEP = 0.02; // Data is filtered to include only time points divisible by 0.02
const DISTRIBUTION_UPDATE_INTERVAL = 0.1; // Update distribution every 0.1 seconds
const DISTRIBUTION_SAMPLE_INTERVAL = 0.05; // Sample positions every 0.05 seconds
const TRAIL_LENGTH = 5; // Number of previous positions to show in trail
const MAX_SPEED_COLOR = 1.5; // Maximum speed for color scaling

// Dataset configurations
const datasets = [
    {
        id: 'none',
        title: 'Free Flight',
        file: './data/trajectories_none.csv',
        canvas: document.getElementById('noneCanvas')
    },
    {
        id: 'co2',
        title: 'CO₂',
        file: './data/trajectories_co2.csv',
        canvas: document.getElementById('co2Canvas')
    },
    {
        id: 'visual',
        title: 'Visual Cue',
        file: './data/trajectories_visual.csv',
        canvas: document.getElementById('visualCanvas')
    },
    {
        id: 'visualco2',
        title: 'Visual + CO₂',
        file: './data/trajectories_visualco2.csv',
        canvas: document.getElementById('visualco2Canvas')
    }
];

// UI elements
const playPauseBtn = document.getElementById('playPauseBtn');
const resetBtn = document.getElementById('resetBtn');

// State variables for each dataset
const simulations = {};
let isPlaying = false;
let lastFrameTime = 0;
let mosquitoImage = new Image();
mosquitoImage.src = './images/mosquito.png';
let loadedDatasets = 0;
let precomputedDatasets = 0;
let totalDatasetsToLoad = datasets.length;
let animationStarted = false;

// Initialize all simulations
function initAllSimulations() {
    datasets.forEach(dataset => {
        // Create context for each canvas
        const ctx = dataset.canvas.getContext('2d');
        
        // Initialize state for each simulation
        simulations[dataset.id] = {
            ctx: ctx,
            mosquitoData: [],
            timePoints: [],
            currentTimeIndex: 0,
            precomputedFrames: [],
            isPrecomputing: false,
            precomputeProgress: 0,
            isReady: false
        };
        
        // Load data for each simulation
        loadData(dataset);
    });
}

// Load data for a specific dataset
async function loadData(dataset) {
    const sim = simulations[dataset.id];
    const ctx = sim.ctx;
    
    try {
        // Show loading message
        ctx.fillStyle = 'black';
        ctx.font = '16px Arial';
        ctx.fillText(`Loading ${dataset.title}...`, 20, 50);
        
        // Load the CSV data
        const response = await fetch(dataset.file);
        
        if (!response.ok) {
            throw new Error(`Failed to load data: ${response.status} ${response.statusText}`);
        }
        
        const csvText = await response.text();
        
        // Parse the CSV
        const parsedData = parseCSV(csvText);
        
        // Store the data
        sim.mosquitoData = parsedData;
        
        // Extract unique time points
        sim.timePoints = [...new Set(parsedData.map(row => row.time))].sort((a, b) => a - b);
        
        // Pre-compute frames for this dataset
        await precomputeFrames(dataset.id);
        
        // Increment loaded datasets counter
        loadedDatasets++;
        
        // If all datasets are loaded, start animation loop (but don't start playing yet)
        if (loadedDatasets === totalDatasetsToLoad && !animationStarted) {
            animationStarted = true;
            requestAnimationFrame(animateAll);
        }
        
    } catch (error) {
        console.error(`Error loading ${dataset.title}:`, error);
        ctx.fillStyle = 'red';
        ctx.font = '16px Arial';
        ctx.fillText(`Error: ${error.message}`, 20, 50);
        ctx.fillText('Check browser console for details', 20, 80);
        ctx.fillText(`Make sure ${dataset.file} exists`, 20, 110);
    }
}

// Parse CSV data
function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    const headers = lines[0].split(',');
    
    return lines.slice(1).map(line => {
        const values = line.split(',');
        const row = {};
        
        headers.forEach((header, index) => {
            row[header] = parseFloat(values[index]);
        });
        
        return row;
    });
}

// Precompute frames for a specific dataset
async function precomputeFrames(datasetId) {
    const sim = simulations[datasetId];
    const ctx = sim.ctx;
    
    sim.isPrecomputing = true;
    sim.precomputeProgress = 0;
    
    // Create a loading message
    ctx.fillStyle = 'black';
    ctx.font = '16px Arial';
    ctx.fillText('Precomputing frames... 0%', 20, 50);
    
    // Create offscreen canvas for precomputing
    const offCanvas = document.createElement('canvas');
    offCanvas.width = ctx.canvas.width;
    offCanvas.height = ctx.canvas.height;
    const offCtx = offCanvas.getContext('2d');
    
    // Precompute frames in chunks to avoid blocking UI
    const chunkSize = 10; // Process 10 frames at a time
    
    for (let i = 0; i < sim.timePoints.length; i += chunkSize) {
        await new Promise(resolve => setTimeout(resolve, 0)); // Allow UI to update
        
        for (let j = 0; j < chunkSize && i + j < sim.timePoints.length; j++) {
            const frameIndex = i + j;
            const time = sim.timePoints[frameIndex];
            
            // Render simulation frame
            offCtx.clearRect(0, 0, offCanvas.width, offCanvas.height);
            const currentMosquitoes = sim.mosquitoData.filter(row => row.time === time);
            currentMosquitoes.forEach(mosquito => {
                drawMosquitoWithTrail(mosquito, offCtx, sim);
            });
            offCtx.fillStyle = 'black';
            offCtx.font = '16px Arial';
            offCtx.fillText(`time: ${time.toFixed(2)}s`, 10, 20);
            
            // Store the frame
            const frameImage = new Image();
            frameImage.src = offCanvas.toDataURL();
            sim.precomputedFrames[frameIndex] = frameImage;
        }
        
        // Update progress
        sim.precomputeProgress = Math.min(100, Math.round((i + chunkSize) / sim.timePoints.length * 100));
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        ctx.fillStyle = 'black';
        ctx.font = '16px Arial';
        ctx.fillText(`Precomputing frames... ${sim.precomputeProgress}%`, 20, 50);
    }
    
    sim.isPrecomputing = false;
    sim.isReady = true;
    
    // Draw the first frame to show it's ready
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (sim.precomputedFrames[0]) {
        ctx.drawImage(sim.precomputedFrames[0], 0, 0);
    }
    
    // Mark this dataset as precomputed
    precomputedDatasets++;
    console.log(`Precomputing complete for ${datasetId} (${precomputedDatasets}/${totalDatasetsToLoad})`);
    
    // If all datasets are precomputed, update UI to show we're ready
    if (precomputedDatasets === totalDatasetsToLoad) {
        console.log("All datasets precomputed, ready to play");
        // Only now set isPlaying to true to start playback
        isPlaying = true;
        playPauseBtn.textContent = 'Pause';
    }
}

// Animate all simulations
function animateAll(timestamp) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    
    const deltaTime = timestamp - lastFrameTime;
    
    // Only play if all datasets are ready and isPlaying is true
    const allReady = Object.values(simulations).every(sim => sim.isReady);
    
    if (isPlaying && allReady) {
        // Use requestAnimationFrame's timestamp for more precise timing
        if (deltaTime >= FRAME_INTERVAL) {
            // Adjust lastFrameTime to account for any drift
            lastFrameTime = timestamp - (deltaTime % FRAME_INTERVAL);
            
            // Update each simulation
            for (const datasetId in simulations) {
                const sim = simulations[datasetId];
                
                if (sim.precomputedFrames.length > 0) {
                    // Draw the precomputed frame
                    sim.ctx.clearRect(0, 0, sim.ctx.canvas.width, sim.ctx.canvas.height);
                    if (sim.precomputedFrames[sim.currentTimeIndex]) {
                        sim.ctx.drawImage(sim.precomputedFrames[sim.currentTimeIndex], 0, 0);
                    }
                    
                    // Move to next time point
                    sim.currentTimeIndex = (sim.currentTimeIndex + 1) % sim.timePoints.length;
                }
            }
        }
    } else if (!allReady) {
        // If not all datasets are ready, just show the loading state
        for (const datasetId in simulations) {
            const sim = simulations[datasetId];
            if (sim.isPrecomputing) {
                sim.ctx.clearRect(0, 0, sim.ctx.canvas.width, sim.ctx.canvas.height);
                sim.ctx.fillStyle = 'black';
                sim.ctx.font = '16px Arial';
                sim.ctx.fillText(`Precomputing frames... ${sim.precomputeProgress}%`, 20, 50);
            }
        }
    }
    
    requestAnimationFrame(animateAll);
}

// Draw a mosquito and its trail
function drawMosquitoWithTrail(mosquito, ctx, sim) {
    // Convert data coordinates to canvas coordinates
    const canvasX = mapToCanvas(mosquito.x, -1, 1, 0, ctx.canvas.width);
    const canvasY = mapToCanvas(mosquito.y, -1, 1, 0, ctx.canvas.height);
    
    // Draw trail
    const trailData = getTrailData(mosquito, sim);
    drawTrail(trailData, ctx);
    
    // Draw mosquito
    drawMosquito(canvasX, canvasY, mosquito.vx, mosquito.vy, ctx);
}

// Get trail data for a mosquito
function getTrailData(currentMosquito, sim) {
    const trail = [];
    let timeIndex = sim.timePoints.indexOf(currentMosquito.time);
    
    // Get previous positions, starting 3 timepoints back
    for (let i = 3; i <= TRAIL_LENGTH + 2; i++) {
        const prevTimeIndex = timeIndex - i;
        if (prevTimeIndex < 0) break;
        
        const prevTime = sim.timePoints[prevTimeIndex];
        const prevPosition = sim.mosquitoData.find(row => 
            row.trajectory_id === currentMosquito.trajectory_id && 
            row.time === prevTime
        );
        
        if (prevPosition) {
            trail.push(prevPosition);
        }
    }
    
    return trail;
}

// Draw the trail behind a mosquito
function drawTrail(trailData, ctx) {
    trailData.forEach((position, index) => {
        const size = 4 - (index * 0.6); // Decreasing size
        if (size <= 0) return;
        
        const canvasX = mapToCanvas(position.x, -1, 1, 0, ctx.canvas.width);
        const canvasY = mapToCanvas(position.y, -1, 1, 0, ctx.canvas.height);
        
        // Color based on speed
        const color = getSpeedColor(position.speed);
        
        ctx.beginPath();
        ctx.arc(canvasX, canvasY, size, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
    });
}

// Draw a mosquito at the specified position
function drawMosquito(x, y, vx, vy, ctx) {
    const mosquitoSize = 20; // Size of the mosquito image
    
    ctx.save();
    ctx.translate(x, y);

    // Rotate to align with velocity vector
    ctx.rotate(Math.atan2(vy, vx) + 0.5 * Math.PI);

    // Draw the mosquito image
    ctx.drawImage(
        mosquitoImage, 
        -mosquitoSize/2, 
        -mosquitoSize/2, 
        mosquitoSize, 
        mosquitoSize
    );
    
    ctx.restore();
}

// Map a value from one range to another
function mapToCanvas(value, inMin, inMax, outMin, outMax) {
    return ((value - inMin) / (inMax - inMin)) * (outMax - outMin) + outMin;
}

// Get color based on speed
function getSpeedColor(speed) {
    // Normalize speed to 0-1 range
    const normalizedSpeed = Math.min(speed / MAX_SPEED_COLOR, 1);
    
    // Use a color gradient: blue (slow) to red (fast)
    const r = Math.floor(normalizedSpeed * 255);
    const g = Math.floor((1 - Math.abs(2 * normalizedSpeed - 1)) * 255);
    const b = Math.floor((1 - normalizedSpeed) * 255);
    
    return `rgb(${r}, ${g}, ${b})`;
}

// Event listeners
playPauseBtn.addEventListener('click', () => {
    isPlaying = !isPlaying;
    playPauseBtn.textContent = isPlaying ? 'Pause' : 'Play';
});

resetBtn.addEventListener('click', () => {
    // Reset all simulations to the beginning
    for (const datasetId in simulations) {
        const sim = simulations[datasetId];
        sim.currentTimeIndex = 0;
        
        // Immediately display the first frame even if paused
        if (sim.precomputedFrames.length > 0 && sim.precomputedFrames[0]) {
            sim.ctx.clearRect(0, 0, sim.ctx.canvas.width, sim.ctx.canvas.height);
            sim.ctx.drawImage(sim.precomputedFrames[0], 0, 0);
        }
    }
});

// Start the simulation when the image is loaded
mosquitoImage.onload = initAllSimulations;

// Initialize if the image is already cached
if (mosquitoImage.complete) {
    initAllSimulations();
}

// Set isPlaying to false initially so animation doesn't start until precomputing is done
isPlaying = false;