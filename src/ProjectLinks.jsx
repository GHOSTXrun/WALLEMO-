import { links } from './config'
export default function ProjectLinks() {
 const names={website:'WEBSITE',x:'X / TWITTER',telegram:'TELEGRAM',docs:'DOCUMENTATION'}
 return <section className="project-links" aria-label="Project links"><b>VELQON / STAY IN THE LOOP</b><div>{Object.entries(names).map(([key,name])=>links[key]?<a key={key} href={links[key]} target="_blank" rel="noreferrer">{name} ↗</a>:<span key={key}>{name} / COMING SOON</span>)}</div></section>
}
