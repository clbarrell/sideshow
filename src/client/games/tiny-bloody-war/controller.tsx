import { useCallback, useEffect, useRef, useState } from "react";
import { isAudioMuted, setAudioMuted, subscribeAudioMuted, unlockAudio } from "../../audio";
import { Joystick } from "../../kit/Joystick";
import type { ControllerProps } from "../registry";
import { isWarPhoneFrame, type WarPhoneFrame, type WarPhoneFrames, type WarInput } from "./host";
import { isWarAudioFrame, WarSound } from "./sound";
import "./controller.css";

const SEND_HZ=20;let sequence=0;const nextSequence=()=>Date.now()*1000+(sequence++%1000);
interface AimPadProps { onAim:(x:number,y:number)=>void; onRelease:()=>void; onCancel:()=>void; disabled:boolean }
function AimPad({onAim,onRelease,onCancel,disabled}:AimPadProps){const box=useRef<HTMLDivElement>(null),pointer=useRef<number|null>(null),origin=useRef({x:0,y:0}),armed=useRef(false);const[knob,setKnob]=useState<{x:number;y:number}|null>(null);const radius=78;
  const move=(e:React.PointerEvent)=>{if(pointer.current!==e.pointerId)return;const r=box.current!.getBoundingClientRect(),dx=e.clientX-r.left-origin.current.x,dy=e.clientY-r.top-origin.current.y,m=Math.hypot(dx,dy),scale=m>radius?radius/m:1;setKnob({x:dx*scale,y:dy*scale});if(m/radius>.32){armed.current=true;onAim(dx/Math.max(radius,m),-dy/Math.max(radius,m));}};
  const down=(e:React.PointerEvent)=>{if(disabled||pointer.current!==null)return;const r=box.current!.getBoundingClientRect();pointer.current=e.pointerId;origin.current={x:e.clientX-r.left,y:e.clientY-r.top};armed.current=false;box.current!.setPointerCapture?.(e.pointerId);setKnob({x:0,y:0});};
  const finish=(e:React.PointerEvent,cancel=false)=>{if(pointer.current!==e.pointerId)return;if(!cancel)move(e);pointer.current=null;setKnob(null);if(cancel||!armed.current)onCancel();else onRelease();armed.current=false;};
  useEffect(()=>()=>{if(pointer.current!==null)onCancel();},[onCancel]);
  return <div ref={box} className="war-aim" role="application" aria-label="Aim and release to attack" aria-disabled={disabled} onPointerDown={down} onPointerMove={move} onPointerUp={e=>finish(e)} onPointerCancel={e=>finish(e,true)} onLostPointerCapture={e=>finish(e,true)}>{knob?<><span className="stick-base" style={{left:origin.current.x,top:origin.current.y,width:radius*2,height:radius*2}}/><span className="stick-knob" style={{left:origin.current.x+knob.x,top:origin.current.y+knob.y}}/></>:<span className="stick-hint">HOLD · AIM</span>}</div>;
}

export default function WarController({you,send,connected,last}:ControllerProps){const movement=useRef({x:0,y:0}),dirty=useRef(false),aiming=useRef(false),sound=useRef<WarSound|null>(null);const[frame,setFrame]=useState<WarPhoneFrame|null>(null),[moving,setMoving]=useState(false),[aimed,setAimed]=useState(false),[muted,setMuted]=useState(isAudioMuted);
  useEffect(()=>{try{sound.current=new WarSound("phone");}catch{/* optional */}return()=>{sound.current?.destroy();sound.current=null;};},[]);useEffect(()=>subscribeAudioMuted(setMuted),[]);
  useEffect(()=>{let own:WarPhoneFrame|undefined;if(isWarPhoneFrame(last))own=last;else if(last&&typeof last==="object"&&!Array.isArray(last)){const b=last as Partial<WarPhoneFrames>;if(b.t==="warStates"&&b.frames)own=b.frames[you.id];}if(own&&isWarPhoneFrame(own)){setFrame(own);for(const cue of own.cues??[]){sound.current?.play(cue);try{if(cue==="ready")navigator.vibrate?.(18);else if(cue==="hit")navigator.vibrate?.([55,25,55]);else if(cue==="block")navigator.vibrate?.(35);else if(cue==="respawn")navigator.vibrate?.([18,20,35]);}catch{/* optional */}}}if(isWarAudioFrame(last))sound.current?.play(last.cue);},[last,you.id]);
  useEffect(()=>{send({sync:true});},[send]);useEffect(()=>{const t=window.setInterval(()=>{if(dirty.current){dirty.current=false;send({moveX:movement.current.x,moveY:movement.current.y});}},1000/SEND_HZ);return()=>clearInterval(t);},[send]);
  const neutralize=useCallback(()=>{const active=Math.hypot(movement.current.x,movement.current.y)>0||aiming.current;movement.current={x:0,y:0};dirty.current=false;aiming.current=false;setMoving(false);setAimed(false);if(active)send({cancel:true});},[send]);useEffect(()=>{const blur=()=>neutralize(),vis=()=>{if(document.visibilityState!=="visible")neutralize();};window.addEventListener("blur",blur);document.addEventListener("visibilitychange",vis);return()=>{neutralize();window.removeEventListener("blur",blur);document.removeEventListener("visibilitychange",vis);};},[neutralize]);useEffect(()=>{if(!connected)neutralize();},[connected,neutralize]);
  const onMove=useCallback((x:number,y:number)=>{unlockAudio();movement.current={x,y};const active=Math.hypot(x,y)>.08;setMoving(active);if(!active){dirty.current=false;send({moveX:0,moveY:0});}else dirty.current=true;},[send]);
  const interactive=connected&&(frame?.interactive??true)&&frame?.phase!=="respawning";const team=frame?.team??(you.seat%2 as 0|1),role=frame?.role??"soldier",teamName=team===0?"RUST SQUARES":"TIDE TRIANGLES";
  return <main className={`pad war-controller team-${team}${!connected?" disconnected":""}`} style={{"--seat":you.color} as React.CSSProperties} data-seat={you.seat+1}>
    <section className="war-rotate" role="status"><b>↻ TURN SIDEWAYS FOR BATTLE</b><span>Left moves · right aims · release attacks</span></section>
    <div className="war-phone">
      <section className={`war-control${moving?" active":""}`}><Joystick label="Move your fighter" onChange={onMove}/><b>MOVE</b></section>
      <section className="war-center" role="status" aria-live="polite"><header><i>{team===0?"■":"▲"}</i><div><small>{teamName}</small><strong><span>{you.seat+1}</span>{you.name}</strong></div></header>
        <div className="war-role-buttons" aria-label="Choose your class"><button type="button" aria-pressed={role==="soldier"} disabled={frame?.phase!=="practice"&&frame?.phase!=="battle-result"} onClick={()=>send({role:"soldier"})}>⬡ SHIELD<small>BLOCK FRONT · THRUST CLOSE</small></button><button type="button" aria-pressed={role==="archer"} disabled={frame?.phase!=="practice"&&frame?.phase!=="battle-result"} onClick={()=>send({role:"archer"})}>➶ ARCHER<small>DRAW · FIRE · KEEP SPACE</small></button></div>
        <div className="war-status"><b>{!connected?"RECONNECTING · INPUT RELEASED":frame?.status??"PRACTICE · CHOOSE YOUR CLASS"}</b><span>{frame?.uneven?"PLAYTEST · UNEVEN TEAMS":`BATTLE ${frame?.battle??1} · ${frame?.wins?.[0]??0}—${frame?.wins?.[1]??0}`}</span></div>
        <button className="war-sound" type="button" aria-label={muted?"Turn sound on":"Turn sound off"} aria-pressed={!muted} onClick={()=>{unlockAudio();setAudioMuted(!muted);}}>{muted?"🔇":"🔊"}</button>
      </section>
      <section className={`war-control${aimed?" active":""}`}><AimPad disabled={!interactive} onAim={(x,y)=>{unlockAudio();aiming.current=true;setAimed(true);send({aimX:x,aimY:y,aiming:true});}} onRelease={()=>{if(!aiming.current)return;aiming.current=false;setAimed(false);send({release:nextSequence()});}} onCancel={()=>{if(aiming.current)send({aiming:false});aiming.current=false;setAimed(false);}}/><b>{role==="soldier"?"AIM · RELEASE THRUST":"AIM · RELEASE ARROW"}</b></section>
    </div>{!connected&&<div className="war-reconnect" role="alert">RECONNECTING…<small>Movement and attack cancelled</small></div>}</main>;
}
