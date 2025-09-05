const { parentPort, workerData } = require("worker_threads");
const tf = require("@tensorflow/tfjs-node");
const axios = require("axios");
const sharp = require("sharp");
const winston = require("winston");
const promClient = require("prom-client");

// Initialize Prometheus metrics
const predictionDuration = new promClient.Histogram({
  name: "worker_prediction_duration_seconds",
  help: "Duration of prediction in worker in seconds",
  buckets: [0.1, 0.5, 1, 2, 5],
});
const predictionErrors = new promClient.Counter({
  name: "worker_prediction_errors_total",
  help: "Total number of prediction errors in worker",
});

// Initialize logger
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [new winston.transports.File({ filename: "worker.log" })],
});

// Function to fetch image from URL
async function fetchImage(imageUrl) {
  try {
    const response = await axios.get(imageUrl, {
      responseType: "arraybuffer",
      timeout: 5000,
    });
    logger.info("Image fetched successfully", { imageUrl });
    return Buffer.from(response.data);
  } catch (err) {
    predictionErrors.inc();
    logger.error(`Failed to fetch image: ${err.message}`, { imageUrl });
    throw new Error("Image fetch failed");
  }
}

// Function to preprocess image
async function preprocessImage(imageBuffer) {
  try {
    const image = await sharp(imageBuffer)
      .resize(224, 224)
      .toFormat("jpeg")
      .toBuffer();

    const tensor = tf.node
      .decodeImage(image)
      .resizeNearestNeighbor([224, 224])
      .toFloat()
      .div(tf.scalar(255))
      .expandDims();

    logger.info("Image preprocessed successfully");
    return tensor;
  } catch (err) {
    predictionErrors.inc();
    logger.error(`Failed to preprocess image: ${err.message}`);
    throw new Error("Image preprocessing failed");
  }
}

// Mock AI model (replace with real model)
async function loadModel() {
  try {
    const model = await tf.loadLayersModel("file://./model/model.json");
    logger.info("Model loaded successfully");
    return model;
  } catch (err) {
    predictionErrors.inc();
    logger.error(`Failed to load model: ${err.message}`);
    throw new Error("Model loading failed");
  }
}

// Prediction function
async function predict(imageUrl, threshold) {
  const end = predictionDuration.startTimer();
  try {
    const model = await loadModel();
    const imageBuffer = await fetchImage(imageUrl);
    const imageTensor = await preprocessImage(imageBuffer);

    const predictions = await model.predict(imageTensor).data();

    const labels = ["car", "pedestrian", "traffic light"];
    const results = predictions.reduce((acc, confidence, idx) => {
      if (confidence >= threshold) {
        acc.push({ label: labels[idx], confidence });
      }
      return acc;
    }, []);

    logger.info("Prediction completed", { imageUrl, results });
    return { objects: results };
  } catch (err) {
    predictionErrors.inc();
    logger.error(`Prediction failed: ${err.message}`, { imageUrl });
    throw err;
  } finally {
    end(); // Record duration
    tf.dispose(); // Clean up tensors
  }
}

// Process worker data
(async () => {
  const { imageUrl, threshold } = workerData;
  try {
    const predictions = await predict(imageUrl, threshold);
    parentPort.postMessage(predictions);
  } catch (err) {
    parentPort.postMessage({ error: err.message });
  }
})();
