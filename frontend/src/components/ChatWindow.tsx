import React, { useState } from "react";
import { encryptMessage, decryptMessage } from "../crypto";

export default function ChatWindow() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<string[]>([]);

  const handleSend = async () => {
    // Example: encrypt message with test keys
    const encrypted = await encryptMessage(input, /* senderPriv */ new Uint8Array(), /* recipientPub */ "...");
    console.log("Encrypted:", encrypted);

    // Normally you’d send this over WebSocket, but for now just decrypt locally
    const decrypted = await decryptMessage(encrypted, /* recipientPriv */ new Uint8Array());
    setMessages([...messages, decrypted]);
    setInput("");
  };

  return (
    <div>
      <div>
        {messages.map((m, i) => (
          <div key={i}>{m}</div>
        ))}
      </div>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <button onClick={handleSend}>Send</button>
    </div>
  );
}
