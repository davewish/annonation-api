require("dotenv").config(); // If using .env
const express = require("express");
const { Server } = require("socket.io");
const http = require("http");
const { encode, decode } = require("@msgpack/msgpack");
const axios = require("axios");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "http://localhost:3000" },
});

let annotations = [];

io.on("connection", (socket) => {
  console.log("Client connected");

  socket.on("aiSuggestion", async (encodedData) => {
    const data = decode(encodedData);
    const imageData = data.image.replace(/^data:image\/\w+;base64,/, "");
    try {
      const response = await axios.post(
        "https://api-inference.huggingface.co/models/facebook/detr-resnet-50",
        { inputs: imageData },
        {
          headers: {
            Authorization: `Bearer ${process.env.HF_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );
      const suggestions = response.data.map((item, index) => ({
        id: Date.now() + index,
        x: item.box.xmin,
        y: item.box.ymin,
        width: item.box.xmax - item.box.xmin,
        height: item.box.ymax - item.box.ymin,
        label: item.label,
        confidence: item.score,
      }));

      socket.emit("aiSuggestion", encode(suggestions));
    } catch (error) {
      console.error(error);
      console.error("AI error:", error.response?.data || error.message);
      socket.emit("aiSuggestion", encode([]));
    }
  });

  socket.on("annotationSave", (encodedData) => {
    const data = decode(encodedData);
    annotations.push(data);
    console.log("Annotations saved:", data);
  });

  socket.on("disconnect", () => console.log("Client disconnected"));
});

server.listen(process.env.PORT || 3001, () =>
  console.log("Backend running on http://localhost:3001")
);
