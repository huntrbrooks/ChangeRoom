import React, { useMemo, useState, useCallback } from "react";
import "./App.css";

const DEFAULT_API_URL = "http://localhost:5000";

function App() {
  const [selectedImage, setSelectedImage] = useState(null);
  const [processedImage, setProcessedImage] = useState(null);
  const [detections, setDetections] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [dropActive, setDropActive] = useState(false);
  const [inferenceMs, setInferenceMs] = useState(null);
  const [history, setHistory] = useState([]);

  const apiBaseUrl = useMemo(
    () => process.env.REACT_APP_API_URL || DEFAULT_API_URL,
    []
  );

  const resetResults = () => {
    setProcessedImage(null);
    setDetections([]);
    setError("");
    setInferenceMs(null);
  };

  const acceptFile = useCallback((file) => {
    if (!file) return;
    setSelectedImage(file);
    resetResults();
  }, []);

  const handleImageChange = (event) => {
    const file = event.target.files?.[0];
    acceptFile(file || null);
  };

  const handleUpload = async () => {
    if (!selectedImage) {
      setError("Please select an image first.");
      return;
    }

    setLoading(true);
    setError("");
    setInferenceMs(null);

    const formData = new FormData();
    formData.append("image", selectedImage);
    const startedAt = performance.now();

    try {
      const response = await fetch(`${apiBaseUrl}/upload`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || `HTTP error ${response.status}`);
      }

      const data = await response.json();
      const elapsed = Math.round(performance.now() - startedAt);
      setInferenceMs(elapsed);

      setProcessedImage(
        data.processed_image
          ? `data:image/png;base64,${data.processed_image}`
          : null
      );
      setDetections(data.detections || []);

      setHistory((prev) => {
        const nextEntry = {
          id: data.request_id || crypto.randomUUID(),
          at: new Date().toLocaleTimeString(),
          detections: data.detections?.length || 0,
          duration: elapsed,
        };
        return [nextEntry, ...prev].slice(0, 5);
      });
    } catch (uploadError) {
      setProcessedImage(null);
      setDetections([]);
      setError(uploadError.message || "Upload failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>YOLOv8 Object Detection</h1>

        <p className="App-subtitle">
          Select an image, upload it, and the backend will return the detected
          objects drawn on top of the image.
        </p>

        <div
          className={`App-dropzone ${dropActive ? "App-dropzone--active" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setDropActive(true);
          }}
          onDragLeave={() => setDropActive(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDropActive(false);
            const file = event.dataTransfer.files?.[0];
            acceptFile(file || null);
          }}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.querySelector("input")?.click();
            }
          }}
        >
          <p>Drag & drop an image here, or click to browse.</p>
          <input type="file" accept="image/*" onChange={handleImageChange} />
        </div>

        <button onClick={handleUpload} disabled={!selectedImage || loading}>
          {loading ? "Processing..." : "Upload and Detect"}
        </button>

        {error && <p className="App-error">{error}</p>}

        {selectedImage && (
          <section className="App-panel">
            <h2>Original Image</h2>
            <img
              src={URL.createObjectURL(selectedImage)}
              alt="Selected"
              className="App-image"
            />
          </section>
        )}

        {processedImage && (
          <section className="App-panel">
            <h2>Processed Image</h2>
            <img src={processedImage} alt="Processed" className="App-image" />

            <div className="App-stats">
              <span>
                Detections: <strong>{detections.length}</strong>
              </span>
              {inferenceMs !== null && (
                <span>
                  Inference: <strong>{inferenceMs} ms</strong>
                </span>
              )}
            </div>

            <h3>Detections</h3>
            {detections.length === 0 ? (
              <p>No objects detected.</p>
            ) : (
              <div className="App-detections">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Class</th>
                      <th>Confidence</th>
                      <th>Box (x1, y1, x2, y2)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detections.map((det, index) => (
                      <tr key={`${det.class}-${index}`}>
                        <td>{index + 1}</td>
                        <td>{det.class}</td>
                        <td>{det.confidence}</td>
                        <td>{det.box.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {history.length > 0 && (
          <section className="App-panel App-history">
            <h3>Recent Runs</h3>
            <ul>
              {history.map((entry) => (
                <li key={entry.id}>
                  {entry.at} — {entry.detections} detections in {entry.duration} ms
                </li>
              ))}
            </ul>
          </section>
        )}
      </header>
    </div>
  );
}

export default App;

