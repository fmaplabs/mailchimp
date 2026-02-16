import "./App.css";
import { useMutation, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState } from "react";

function App() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [emailId, setEmailId] = useState<string | null>(null);

  const sendWelcome = useMutation(api.example.sendWelcomeEmail);
  const sendTemplate = useMutation(api.example.sendTemplateEmail);
  const status = useQuery(
    api.example.checkEmailStatus,
    emailId ? { emailId } : "skip",
  );

  const handleSendWelcome = async () => {
    if (email && name) {
      const id = await sendWelcome({ email, name });
      setEmailId(id);
    }
  };

  const handleSendTemplate = async () => {
    if (email && name) {
      const id = await sendTemplate({ email, name });
      setEmailId(id);
    }
  };

  return (
    <>
      <h1>Mailchimp Transactional Email Demo</h1>
      <div className="card">
        <div style={{ marginBottom: "1rem" }}>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Recipient email"
            style={{ marginRight: "0.5rem", padding: "0.5rem" }}
          />
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Recipient name"
            style={{ marginRight: "0.5rem", padding: "0.5rem" }}
          />
        </div>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
          <button onClick={handleSendWelcome}>Send Welcome Email</button>
          <button onClick={handleSendTemplate}>Send Template Email</button>
        </div>
        {emailId && (
          <div
            style={{
              padding: "1rem",
              backgroundColor: "rgba(128, 128, 128, 0.1)",
              borderRadius: "8px",
            }}
          >
            <h3>Email Status</h3>
            <p>
              <strong>Email ID:</strong> {emailId}
            </p>
            {status ? (
              <div>
                <p>
                  <strong>Status:</strong> {status.status}
                </p>
                <p>
                  <strong>Bounced:</strong> {String(status.bounced)}
                </p>
                <p>
                  <strong>Opened:</strong> {String(status.opened)}
                </p>
                <p>
                  <strong>Clicked:</strong> {String(status.clicked)}
                </p>
              </div>
            ) : (
              <p>Loading status...</p>
            )}
          </div>
        )}
        <p style={{ marginTop: "1rem" }}>
          See <code>example/convex/example.ts</code> for usage examples
        </p>
      </div>
    </>
  );
}

export default App;
