import React from "react";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import Home from "./pages/Home.jsx";
import AstaRoom from "./pages/AstaRoom.jsx";
import ControlloVersione from "./components/ControlloVersione.jsx";

function AstaRoomKeyed() {
  const { codice } = useParams();
  return <AstaRoom key={codice} />;
}

export default function App() {
  return (
    <BrowserRouter basename="/fantacalcio-asta/">
      <ControlloVersione />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/asta/:codice" element={<AstaRoomKeyed />} />
      </Routes>
    </BrowserRouter>
  );
}
