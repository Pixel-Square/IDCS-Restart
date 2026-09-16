import React from 'react'
import idcsLogo from '../assets/idcs-logo.png'

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;800&family=Titan+One&display=swap');

  .uc-site-container {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 100vh;
    background-color: #E8D5B5;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Nunito', sans-serif;
  }

  .uc-text-wrapper {
    position: relative;
    z-index: 5;
    text-align: center;
    color: #2A2A2A;
    background: rgba(255, 255, 255, 0.4);
    padding: 40px 60px;
    border-radius: 20px;
    box-shadow: 0 10px 30px rgba(0,0,0,0.05);
    border: 2px solid rgba(255,255,255,0.6);
  }

  .uc-text-wrapper h1 {
    font-family: 'Titan One', cursive;
    font-size: 4rem;
    margin: 0 0 10px 0;
    color: #222;
    text-transform: uppercase;
    letter-spacing: 2px;
    text-shadow: 2px 2px 0px #FFCC00;
  }

  .uc-text-wrapper p {
    font-size: 1.3rem;
    font-weight: 800;
    margin: 0;
    color: #444;
    line-height: 1.5;
  }

  .uc-logo {
    display: block;
    margin: 0 auto 18px auto;
    width: 160px;
    max-width: 100%;
    filter: drop-shadow(0 2px 6px rgba(0,0,0,0.12));
  }

  .uc-stripes {
    position: absolute;
    top: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 80%;
    height: 12px;
    border-bottom-left-radius: 10px;
    border-bottom-right-radius: 10px;
    background: repeating-linear-gradient(
      45deg,
      #FFCC00,
      #FFCC00 10px,
      #222 10px,
      #222 20px
    );
  }

  .uc-ground-line {
    position: absolute;
    width: 100%;
    border-bottom: 3px dashed rgba(160, 130, 90, 0.4);
  }

  .uc-bg-line { top: 35%; z-index: 1; }
  .uc-fg-line { bottom: 20%; z-index: 9; }

  .uc-vehicle { position: absolute; }

  .uc-bulldozer {
    top: calc(35% - 65px);
    left: -150px;
    z-index: 2;
    transform: scale(0.7);
    opacity: 0.8;
    animation: ucDriveSlow 30s linear infinite;
  }

  .uc-forklift {
    bottom: calc(20% - 15px);
    left: -150px;
    z-index: 10;
    animation: ucDriveFast 17s linear infinite;
  }

  .uc-crane {
    bottom: calc(35% - 20px);
    right: 5%;
    z-index: 4;
    transform: scaleX(-1) scale(1.1);
  }

  .uc-crane-arm-group {
    transform-origin: 40px 90px;
    animation: ucLiftArm 8s ease-in-out infinite;
  }

  @keyframes ucDriveSlow {
    0%   { left: -150px; transform: scale(0.7) scaleX(1); }
    40%  { left: calc(100% + 150px); transform: scale(0.7) scaleX(1); }
    45%  { left: calc(100% + 150px); transform: scale(0.7) scaleX(-1); }
    85%  { left: -150px; transform: scale(0.7) scaleX(-1); }
    90%  { left: -150px; transform: scale(0.7) scaleX(1); }
    100% { left: -150px; transform: scale(0.7) scaleX(1); }
  }

  @keyframes ucDriveFast {
    0%   { left: -150px; transform: scale(1) scaleX(1); }
    10%  { left: -150px; transform: scale(1) scaleX(1); }
    45%  { left: calc(100% + 150px); transform: scale(1) scaleX(1); }
    50%  { left: calc(100% + 150px); transform: scale(1) scaleX(-1); }
    85%  { left: -150px; transform: scale(1) scaleX(-1); }
    95%  { left: -150px; transform: scale(1) scaleX(1); }
    100% { left: -150px; transform: scale(1) scaleX(1); }
  }

  @keyframes ucLiftArm {
    0%,  15% { transform: rotate(0deg); }
    40%, 60% { transform: rotate(-35deg); }
    85%,100% { transform: rotate(0deg); }
  }

  @media (max-width: 768px) {
    .uc-text-wrapper h1 { font-size: 2rem; }
    .uc-text-wrapper p  { font-size: 0.95rem; }
    .uc-text-wrapper    { padding: 24px 18px; width: 88%; }
    .uc-logo            { width: 110px; margin-bottom: 12px; }
    .uc-crane    { transform: scaleX(-1) scale(0.7); right: -10%; }
    .uc-forklift { transform: scale(0.8); }
    .uc-bulldozer{ transform: scale(0.5); }
  }

  @media (max-width: 480px) {
    .uc-text-wrapper h1 { font-size: 1.5rem; letter-spacing: 1px; }
    .uc-text-wrapper p  { font-size: 0.85rem; }
    .uc-text-wrapper    { padding: 20px 14px; width: 92%; }
    .uc-logo            { width: 90px; margin-bottom: 10px; }
    .uc-crane    { transform: scaleX(-1) scale(0.5); right: -15%; }
    .uc-forklift { transform: scale(0.65); }
    .uc-bulldozer{ transform: scale(0.4); }
  }
`

export default function BuildingInfo() {
  return (
    <>
      <style>{css}</style>

      <div className="uc-site-container">

        <div className="uc-ground-line uc-bg-line" />

        {/* Bulldozer */}
        <div className="uc-vehicle uc-bulldozer">
          <svg viewBox="0 0 120 80" width="120" height="80" xmlns="http://www.w3.org/2000/svg">
            <path d="M 90 20 Q 110 45, 95 75 L 105 75 Q 120 45, 100 20 Z" fill="#999"/>
            <line x1="60" y1="50" x2="100" y2="50" stroke="#333" strokeWidth="6" strokeLinecap="round"/>
            <path d="M 20 55 L 20 25 C 20 15, 25 10, 35 10 L 65 10 C 75 10, 80 15, 80 25 L 80 55 Z" fill="#FFB300"/>
            <rect x="50" y="15" width="20" height="20" rx="3" fill="#AEE2FF"/>
            <rect x="30" y="0" width="6" height="15" rx="2" fill="#555"/>
            <rect x="10" y="55" width="80" height="20" rx="10" fill="#222"/>
            <circle cx="20" cy="65" r="5" fill="#666"/>
            <circle cx="35" cy="65" r="5" fill="#666"/>
            <circle cx="50" cy="65" r="5" fill="#666"/>
            <circle cx="65" cy="65" r="5" fill="#666"/>
            <circle cx="80" cy="65" r="5" fill="#666"/>
          </svg>
        </div>

        {/* Crane */}
        <div className="uc-vehicle uc-crane">
          <svg viewBox="0 0 150 150" width="180" height="180" xmlns="http://www.w3.org/2000/svg">
            <rect x="20" y="100" width="70" height="30" rx="6" fill="#FFCC00"/>
            <rect x="60" y="65" width="30" height="35" rx="4" fill="#AEE2FF"/>
            <rect x="60" y="65" width="30" height="35" rx="4" fill="none" stroke="#FFCC00" strokeWidth="5"/>
            <circle cx="35" cy="130" r="12" fill="#222"/>
            <circle cx="75" cy="130" r="12" fill="#222"/>
            <circle cx="35" cy="130" r="5" fill="#999"/>
            <circle cx="75" cy="130" r="5" fill="#999"/>
            <g className="uc-crane-arm-group">
              <rect x="35" y="85" width="100" height="10" rx="4" fill="#FF8C00"/>
              <line x1="125" y1="95" x2="125" y2="135" stroke="#333" strokeWidth="2"/>
              <path d="M 120 135 C 120 145, 130 145, 130 135" fill="none" stroke="#333" strokeWidth="4" strokeLinecap="round"/>
            </g>
            <circle cx="40" cy="90" r="10" fill="#333"/>
          </svg>
        </div>

        {/* Text */}
        <div className="uc-text-wrapper">
          <div className="uc-stripes" />
          <img src={idcsLogo} alt="IDCS Logo" className="uc-logo" />
          <h1>Under Construction</h1>
          <p>We're working on something big!<br />Check back soon for updates.</p>
        </div>

        <div className="uc-ground-line uc-fg-line" />

        {/* Forklift */}
        <div className="uc-vehicle uc-forklift">
          <svg viewBox="0 0 100 80" width="100" height="80" xmlns="http://www.w3.org/2000/svg">
            <rect x="10" y="30" width="55" height="35" rx="8" fill="#FFCC00"/>
            <path d="M 20 30 L 25 5 L 50 5 L 55 30" fill="none" stroke="#333" strokeWidth="5" strokeLinejoin="round"/>
            <rect x="25" y="25" width="10" height="10" fill="#333"/>
            <rect x="70" y="5" width="6" height="60" rx="2" fill="#333"/>
            <path d="M 75 55 L 98 55" fill="none" stroke="#222" strokeWidth="5" strokeLinecap="round"/>
            <path d="M 75 60 L 98 60" fill="none" stroke="#222" strokeWidth="3" strokeLinecap="round"/>
            <circle cx="25" cy="65" r="10" fill="#222"/>
            <circle cx="55" cy="65" r="10" fill="#222"/>
            <circle cx="25" cy="65" r="4" fill="#999"/>
            <circle cx="55" cy="65" r="4" fill="#999"/>
          </svg>
        </div>

      </div>
    </>
  )
}
