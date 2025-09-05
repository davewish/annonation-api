const fs = require("fs");
const JSONStream = require("JSONStream");
function processSensorData(filePath) {
  const aggregates = new Map();
  const stream = fs.createReadStream(filePath, { encoding: "utf-8" });
  const parser = JSONStream.parse("sensors.*");
  return new Promise((resolve, reject) => {
    parser.on("data", (record) => {
      try {
        const vehicleId = record.vehicle_id;
        const speed = record.speed;
        if (!isNaN(speed)) {
          const entry = aggregates.get(vehicleId) || { sum: 0, count: 0 };
          entry.sum += speed;
          entry.count += 1;
          aggregates.set(vehicleId, entry);
        }
      } catch (error) {
        console.warn(`Skipping record : ${error.message}`);
      }
    });
    parser.on("end", () =>
      resolve(
        Object.fromEntries(
          [...aggregates].map((id, { sum, count }) => [id, sum / count])
        )
      )
    );
    parser.on("error", reject);
    stream.pipe(parser);
  });
}
