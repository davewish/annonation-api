const express = require("express");
const { Server } = require("socket.io");
const http = require("http");
const { encode, decode } = require("@msgpack/msgpack");
const axios = require("axios");
const mongoose = require("mongoose");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:3000" }, // Frontend URL
});

let annotations = [];

mongoose
  .connect("mongodb+srv://your-free-atlas-url", { useNewUrlParser: true })
  .then(() => console.log("DB connected"))
  .catch((err) => console.error(err));

const AnnotationSchema = new mongoose.Schema({ data: Object });
const Annotation = mongoose.model("Annotation", AnnotationSchema);

io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("aiSuggestion", async (encodedData) => {
    const data = decode(encodedData);
    try {
      // Call free Hugging Face YOLO API
      const response = await axios.post(
        "https://api-inference.huggingface.co/models/ultralytics/yolov5s",
        data.image,
        {
          headers: { Authorization: "Bearer hf_your-free-api-key" },
        }
      );
      const suggestions = response.data;
      socket.emit("aiSuggestion", encode(suggestions));
    } catch (error) {
      console.error("AI error:", error);
      socket.emit("aiSuggestion", encode([]));
    }
  });

  socket.on("annotationSave", async (encodedData) => {
    const data = decode(encodedData);
    annotations.push(data);
    console.log("Annotations saved:", data);
  });

  socket.on("disconnect", () => console.log("Client disconnected"));
});

server.listen(3001, () =>
  console.log("Backend running on http://localhost:3001")
);
