import { usePlatform } from './PlatformContext'
export default function BrandStory({onLaunch,onRegistry}) {
 const platform=usePlatform()
 return <>
  <section className="brand-hero" aria-labelledby="hero-title">
   <div className="hero-copy">
    <div className="brand-eyebrow"><span className="brand-dot"/> SOLANA NATIVE <span>/</span> AGENT ECONOMY</div>
    <h1 id="hero-title">Give your agent<br/>a public <em>beginning.</em></h1>
    <p className="hero-description">The launch layer for the agent economy. Turn an agent idea into a wallet-controlled Solana launch, with a public record people can inspect.</p>
    <div className="hero-actions"><button className="brand-primary" onClick={onLaunch}>START A LAUNCH <span>↗</span></button><button className="brand-secondary" onClick={onRegistry}>EXPLORE THE REGISTRY <span>↓</span></button></div>
    <div className="hero-footnote"><span>BUILDER PREVIEW</span><span>YOUR WALLET STAYS IN CONTROL</span></div>
   </div>
   <div className="hero-mark"><div className="mark-meta"><span>VELQON / 001</span><span>IDEA → ONCHAIN</span></div><img src={import.meta.env.BASE_URL+'velqon-logo.png'} alt="VELQON mascot with black glasses and purple eyes on mint green"/><div className="mark-caption"><b>A NEW POINT OF VIEW.</b><span>FOR AN AGENT-NATIVE WORLD.</span></div></div>
  </section>
  <section className="brand-thesis" id="thesis" aria-labelledby="thesis-title">
   <div className="thesis-heading"><span className="brand-eyebrow">THE VELQON THESIS</span><h2 id="thesis-title">Software is becoming<br/>a market participant.</h2><p>Agents are starting to build, transact and coordinate. We believe their first step onchain should be clear, inspectable and controlled by the people behind them.</p></div>
   <div className="thesis-cards">
    <article><span>01 / CONNECT</span><h3>Begin with control.</h3><p>Connect your Solana wallet. Ownership verification is optional; you approve every publish and launch.</p><b>AVAILABLE NOW ↗</b></article>
    <article><span>02 / LAUNCH</span><h3>Make it public.</h3><p>Prepare a Solana token launch. Keep the mint and transaction a click away.</p><b>AVAILABLE NOW ↗</b></article>
    <article><span>03 / COORDINATE</span><h3>Build what comes next.</h3><p>Create wallet-verified profiles and share signed field notes. Agent-to-agent commerce remains a research direction.</p><b>{platform.connected?'COMMUNITY BACKEND CONNECTED ↗':'COMMUNITY BACKEND REQUIRED ◇'}</b></article>
   </div>
  </section>
  <div className="workspace-heading"><div><span className="brand-eyebrow">THE BUILDER WORKSPACE</span><h2>Ideas meet execution.</h2></div><a href="#access">LAUNCH GUIDE ↙</a></div>
 </>
}
