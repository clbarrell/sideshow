import { describe, expect, it, vi } from "vitest";
import type { Player } from "../../src/shared/protocol";
import { WAR_RULES, applyWarInput, createHost, createWarState, stepWarState, warResults } from "../../src/client/games/tiny-bloody-war/host";

const player=(id:string,seat:number):Player=>({id,name:`P${seat+1}`,seat,color:["#f55","#0cc","#fc0","#39f","#a7f","#fa8","#9e4","#f93","#3ee","#d6f"][seat],connected:true,ready:true,awayAt:null});
const players=(n:number)=>Array.from({length:n},(_,i)=>player(`p${i+1}`,i));
const advance=(s:ReturnType<typeof createWarState>,seconds:number)=>{for(let t=0;t<seconds-.00001;t+=.05)stepWarState(s,Math.min(.05,seconds-t));};

describe("Tiny Bloody War simulation",()=>{
  it("offers harmless practice, resets positions, and enables a shared GO at ten seconds",()=>{const s=createWarState(players(4),7);s.fighters[0].x=123;applyWarInput(s,"p1",{role:"archer"});advance(s,WAR_RULES.practice+.01);expect(s.phase).toBe("countdown");expect(s.fighters[0].role).toBe("archer");expect(s.fighters[0].x).toBe(-690);advance(s,WAR_RULES.runway-WAR_RULES.practice+.01);expect(s.phase).toBe("live");expect(s.goFlash).toBeGreaterThan(0);});

  it("requires a deliberate hold and consumes one release sequence once",()=>{const s=createWarState(players(4),2);const f=s.fighters[0];applyWarInput(s,f.id,{aimX:1,aimY:0,aiming:true});stepWarState(s,.1);applyWarInput(s,f.id,{release:1});expect(f.recovery).toBe(0);applyWarInput(s,f.id,{aimX:1,aimY:0,aiming:true});advance(s,.2);applyWarInput(s,f.id,{release:2});expect(f.recovery).toBeGreaterThan(0);const recovery=f.recovery;applyWarInput(s,f.id,{release:2});expect(f.recovery).toBe(recovery);});

  it("cancels aim without attacking and neutralizes malformed input",()=>{const s=createWarState(players(4),3);const f=s.fighters[0];expect(()=>applyWarInput(s,f.id,{moveX:Infinity,moveY:"oops",aimX:NaN,aimY:0})).not.toThrow();applyWarInput(s,f.id,{aimX:1,aimY:0,aiming:true});advance(s,.25);applyWarInput(s,f.id,{cancel:true,release:9});expect(f.recovery).toBe(0);expect(f.aiming).toBe(false);expect(f.moveX).toBe(0);});

  it("lets a facing shield intercept an enemy arrow but never a friendly arrow",()=>{const s=createWarState(players(4),4);s.phase="live";const defender=s.fighters[0],enemy=s.fighters[1],ally=s.fighters[2];defender.x=defender.y=0;defender.role="soldier";defender.facing=0;defender.aiming=true;defender.aimHeld=1;enemy.role="archer";enemy.x=110;enemy.y=0;enemy.aimX=-1;enemy.aimY=0;enemy.aiming=true;enemy.aimHeld=1;applyWarInput(s,enemy.id,{release:1});advance(s,.3);expect(defender.blocks).toBe(1);expect(defender.health).toBe(3);ally.role="archer";ally.x=-110;ally.y=0;ally.aimX=1;ally.aimY=0;ally.aiming=true;ally.aimHeld=1;applyWarInput(s,ally.id,{release:2});advance(s,.3);expect(defender.blocks).toBe(1);expect(defender.health).toBe(3);});

  it("scores only uncontested banner time and relocates at authored times",()=>{const s=createWarState(players(4),5);s.phase="live";for(const f of s.fighters){f.x=f.team?700:0;f.y=0;}advance(s,2);expect(s.scores[0]).toBeCloseTo(2,1);s.fighters[1].x=0;advance(s,1);expect(s.scores[0]).toBeCloseTo(2,1);advance(s,27.1);expect(s.objectiveIndex).toBe(1);});

  it("respawns quickly with visible protection that ends on entering the objective",()=>{const s=createWarState(players(4),6);s.phase="live";const f=s.fighters[0];f.deadFor=WAR_RULES.respawn;f.health=0;advance(s,WAR_RULES.respawn+.01);expect(f.health).toBe(3);expect(f.protectedFor).toBeGreaterThan(0);f.x=0;f.y=0;stepWarState(s,.05);expect(f.protectedFor).toBe(0);});

  it("returns equal team credit exactly once and preserves a draw",()=>{const s=createWarState(players(4),8);s.wins=[2,0];const r=warResults(s);expect(r).toHaveLength(4);expect(r.filter(x=>x.place===1).map(x=>x.id)).toEqual(["p1","p3"]);expect(new Set(r.map(x=>x.score))).toEqual(new Set([3,1]));s.wins=[1,1];expect(warResults(s).every(x=>x.place===1&&x.score===2)).toBe(true);});
});

describe("Tiny Bloody War host seam",()=>{
  it("batches ten-player status below the room message budget",()=>{const send=vi.fn();const host=createHost({players:players(10),seed:9,width:1280,height:720,send});for(let i=0;i<100;i++)host.tick(.05);expect(send.mock.calls.length).toBeLessThanOrEqual(27);expect(send.mock.calls.every(([,to])=>to===undefined)).toBe(true);expect(send).toHaveBeenLastCalledWith(expect.objectContaining({t:"warStates",frames:expect.objectContaining({p1:expect.objectContaining({t:"warState"}),p10:expect.objectContaining({t:"warState"})})}));host.destroy?.();});
});
