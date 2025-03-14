// Constants
const FPS = 50;
const FRAME_INTERVAL = 1000 / FPS;
const TIME_STEP = 0.02; // Data is filtered to include only time points divisible by 0.02
const DISTRIBUTION_UPDATE_INTERVAL = 0.1; // Update distribution every 0.1 seconds
const DISTRIBUTION_SAMPLE_INTERVAL = 0.05; // Sample positions every 0.05 seconds
const TRAIL_LENGTH = 10; // Number of previous positions to show in trail
const MAX_SPEED_COLOR = 1.5; // Maximum speed for color scaling

// Canvas setup
const simulationCanvas = document.getElementById('simulationCanvas');
const simulationCtx = simulationCanvas.getContext('2d');
const distributionCanvas = document.getElementById('distributionCanvas');
const distributionCtx = distributionCanvas.getContext('2d');

// UI elements
const playPauseBtn = document.getElementById('playPauseBtn');
const resetBtn = document.getElementById('resetBtn');

// State variables
let mosquitoData = []; // Will hold all the data
let timePoints = []; // Will hold all unique time points
let currentTimeIndex = 0;
let isPlaying = true;
let lastFrameTime = 0;
let lastDistributionUpdateTime = 0;
let mosquitoImage = new Image();
mosquitoImage.src = './images/mosquito.png';

// Initialize the simulation
async function init() {
    try {
        // Load the CSV data with proper path
        const response = await fetch('./data/trajectories_visualco2.csv');
        
        // If the fetch fails, show a more helpful error
        if (!response.ok) {
            throw new Error(`Failed to load data: ${response.status} ${response.statusText}`);
        }
        
        const csvText = await response.text();
        
        // Parse the CSV
        const parsedData = parseCSV(csvText);
        
        // Filter data to include only time points divisible by 0.02
        mosquitoData = parsedData.filter(row => {
            // Check if time is divisible by 0.02 (accounting for floating point precision)
            return Math.abs(row.time / 0.02 - Math.round(row.time / 0.02)) < 0.0001;
        });
        
        // Extract unique time points
        timePoints = [...new Set(mosquitoData.map(row => row.time))].sort((a, b) => a - b);
        
        // Start the animation loop
        requestAnimationFrame(animate);
        
    } catch (error) {
        console.error('Error initializing simulation:', error);
        // Display error on the canvas for better visibility
        simulationCtx.fillStyle = 'red';
        simulationCtx.font = '16px Arial';
        simulationCtx.fillText(`Error: ${error.message}`, 20, 50);
        simulationCtx.fillText('Check browser console for details', 20, 80);
        simulationCtx.fillText('Make sure data/trajectories_visualco2.csv exists', 20, 110);
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

// Animation loop
function animate(timestamp) {
    if (!lastFrameTime) lastFrameTime = timestamp;
    
    const deltaTime = timestamp - lastFrameTime;
    
    if (isPlaying && deltaTime >= FRAME_INTERVAL) {
        lastFrameTime = timestamp;
        
        // Update simulation
        updateSimulation();
        
        // Update distribution if needed
        const currentTime = timePoints[currentTimeIndex];
        if (currentTime - lastDistributionUpdateTime >= DISTRIBUTION_UPDATE_INTERVAL || lastDistributionUpdateTime === 0) {
            updateDistribution(currentTime);
            lastDistributionUpdateTime = currentTime;
        }
    }
    
    requestAnimationFrame(animate);
}

// Update the simulation for the current time point
function updateSimulation() {
    const currentTime = timePoints[currentTimeIndex];
    
    // Clear the canvas
    simulationCtx.clearRect(0, 0, simulationCanvas.width, simulationCanvas.height);
    
    // Draw coordinate system
    drawCoordinateSystem(simulationCtx, simulationCanvas.width, simulationCanvas.height);
    
    // Get mosquitoes at the current time
    const currentMosquitoes = mosquitoData.filter(row => row.time === currentTime);
    
    // Draw each mosquito and its trail
    currentMosquitoes.forEach(mosquito => {
        drawMosquitoWithTrail(mosquito);
    });
    
    // Display current time
    simulationCtx.fillStyle = 'black';
    simulationCtx.font = '16px Arial';
    simulationCtx.fillText(`Time: ${currentTime.toFixed(2)}s`, 10, 20);
    
    // Move to next time point
    currentTimeIndex = (currentTimeIndex + 1) % timePoints.length;
}

// Draw coordinate system
function drawCoordinateSystem(ctx, width, height) {
    const centerX = width / 2;
    const centerY = height / 2;
    
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    
    // Draw grid lines
    ctx.beginPath();
    for (let x = 0; x <= width; x += 50) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
    }
    for (let y = 0; y <= height; y += 50) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
    }
    ctx.stroke();
    
    // Draw axes
    ctx.strokeStyle = '#999';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width, centerY);
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, height);
    ctx.stroke();
}

// Draw a mosquito and its trail
function drawMosquitoWithTrail(mosquito) {
    // Convert data coordinates to canvas coordinates
    const canvasX = mapToCanvas(mosquito.x, -1, 1, 0, simulationCanvas.width);
    const canvasY = mapToCanvas(mosquito.y, -1, 1, simulationCanvas.height, 0);
    
    // Draw trail
    const trailData = getTrailData(mosquito);
    drawTrail(trailData);
    
    // Draw mosquito
    drawMosquito(canvasX, canvasY, mosquito.vx, mosquito.vy);
}

// Get trail data for a mosquito
function getTrailData(currentMosquito) {
    const trail = [];
    let timeIndex = timePoints.indexOf(currentMosquito.time);
    
    // Get previous positions
    for (let i = 1; i <= TRAIL_LENGTH; i++) {
        const prevTimeIndex = timeIndex - i;
        if (prevTimeIndex < 0) break;
        
        const prevTime = timePoints[prevTimeIndex];
        const prevPosition = mosquitoData.find(row => 
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
function drawTrail(trailData) {
    trailData.forEach((position, index) => {
        const size = 8 - (index * 0.7); // Decreasing size
        if (size <= 0) return;
        
        const canvasX = mapToCanvas(position.x, -1, 1, 0, simulationCanvas.width);
        const canvasY = mapToCanvas(position.y, -1, 1, simulationCanvas.height, 0);
        
        // Color based on speed
        const color = getSpeedColor(position.speed);
        
        simulationCtx.beginPath();
        simulationCtx.arc(canvasX, canvasY, size, 0, Math.PI * 2);
        simulationCtx.fillStyle = color;
        simulationCtx.fill();
    });
}

// Draw a mosquito at the specified position
function drawMosquito(x, y, vx, vy) {
    const mosquitoSize = 20; // Size of the mosquito image
    
    simulationCtx.save();
    simulationCtx.translate(x, y);
    
    // Rotate to align with velocity vector
    simulationCtx.rotate(Math.atan2(vy, vx) + Math.PI/2);
    
    // Draw the mosquito image
    simulationCtx.drawImage(
        mosquitoImage, 
        -mosquitoSize/2, 
        -mosquitoSize/2, 
        mosquitoSize, 
        mosquitoSize
    );
    
    simulationCtx.restore();
}

// Update the distribution visualization
function updateDistribution(currentTime) {
    // Clear the canvas
    distributionCtx.clearRect(0, 0, distributionCanvas.width, distributionCanvas.height);
    
    // Draw coordinate system
    drawCoordinateSystem(distributionCtx, distributionCanvas.width, distributionCanvas.height);
    
    // Find all positions within the sampling interval
    const sampleTimes = timePoints.filter(time => 
        time <= currentTime && 
        time > currentTime - DISTRIBUTION_SAMPLE_INTERVAL
    );
    
    // Get all mosquito positions at these times
    const positions = mosquitoData.filter(row => sampleTimes.includes(row.time));
    
    // Draw the distribution
    distributionCtx.fillStyle = 'rgba(255, 0, 0, 0.3)';
    positions.forEach(position => {
        const canvasX = mapToCanvas(position.x, -1, 1, 0, distributionCanvas.width);
        const canvasY = mapToCanvas(position.y, -1, 1, distributionCanvas.height, 0);
        
        distributionCtx.beginPath();
        distributionCtx.arc(canvasX, canvasY, 3, 0, Math.PI * 2);
        distributionCtx.fill();
    });
    
    // Display title
    distributionCtx.fillStyle = 'black';
    distributionCtx.font = '16px Arial';
    distributionCtx.fillText(`Position Distribution (t = ${currentTime.toFixed(2)}s)`, 10, 20);
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
    currentTimeIndex = 0;
    lastDistributionUpdateTime = 0;
});

// Start the simulation when the image is loaded
mosquitoImage.onload = init;

// Initialize if the image is already cached
if (mosquitoImage.complete) {
    init();
} 