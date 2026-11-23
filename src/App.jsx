
import { useState } from "react";
import "./App.css";

function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(e) {
    e.preventDefault();

    if (!email || !password) {
      setMessage("Barcha maydonlarni to'ldiring!");
      return;
    }

    setMessage("Login muvaffaqiyatli yuborildi!");
  }

  return (
    <div className="container">
      <form onSubmit={handleSubmit}>
        <h2>Login</h2>

        <input
          type="email"
          placeholder="Email kiriting"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          type="password"
          placeholder="Parol kiriting"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button type="submit">Send</button>

        <p>{message}</p>
      </form>
    </div>
  );
}

export default App;
