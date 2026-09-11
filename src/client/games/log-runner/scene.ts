import { currentObstacle, LOG_RUNNER_RULES, logRunnerResults, type LogRunnerState, type LogRunnerPlayer, type LogRunnerObstacle } from "./host";

// A fixed perspective diorama. Coordinates describe a shallow world, not a
// second simulation; all answers and collisions remain host-owned.
type Point = [number, number, number];
const INK = "#102E32", CREAM = "#FFF3D7", ORANGE = "#FA9B42";
const FONT = "Archivo, system-ui, sans-serif";
const clamp = (v: number) => Math.max(0, Math.min(1, v));
function project([x, y, z]: Point): [number, number] {
  const scale = 1 / (1 + z / 16);
  return [800 + x * 75 * scale, 638 - (y * 75 + z * 21) * scale];
}
function poly(c: CanvasRenderingContext2D, points: number[][], fill: string) {
  c.fillStyle = fill; c.beginPath();
  points.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y));
  c.closePath(); c.fill();
}
function face(c: CanvasRenderingContext2D, points: Point[], fill: string) { poly(c, points.map(project), fill); }
function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, size = 24, color = CREAM, align: CanvasTextAlign = "center", width?: number) {
  c.fillStyle = color; c.font = `850 ${size}px ${FONT}`; c.textAlign = align; c.textBaseline = "middle";
  if (width === undefined) c.fillText(text, x, y); else c.fillText(text, x, y, width);
}
function box(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string, radius = 12) {
  c.fillStyle = fill; c.beginPath(); c.roundRect(x, y, w, h, radius); c.fill();
}
function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, fill: string) {
  c.fillStyle = fill; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
}
function tree(c: CanvasRenderingContext2D, x: number, z: number, height: number) {
  face(c, [[x - .12,0,z],[x + .12,0,z],[x + .08,height,z],[x - .08,height,z]], "#5D6550");
  for (let tier = 0; tier < 3; tier++) {
    const y = height * (.35 + tier * .2), span = height * (.28 - tier * .06);
    face(c, [[x-span,y,z],[x,height*(.7+tier*.16),z],[x,y,z-.3]], tier === 0 ? "#234C43" : "#366855");
    face(c, [[x,y,z-.3],[x,height*(.7+tier*.16),z],[x+span,y,z]], "#58856B");
  }
}
function environment(c: CanvasRenderingContext2D, time: number, reduced: boolean) {
  const sky = c.createLinearGradient(0, 100, 0, 550);
  sky.addColorStop(0, "#C9DCCA"); sky.addColorStop(.6, "#E9E5C5"); sky.addColorStop(1,"#71B7AD");
  c.fillStyle = sky; c.fillRect(0, 0, 1600, 900);
  ellipse(c, 1170, 255, 64, 64, "#FFF0BF");
  poly(c, [[0,420],[0,240],[150,195],[315,320],[455,250],[640,361],[800,320],[930,360],[1060,285],[1280,340],[1460,210],[1600,280],[1600,500]], "#96B9A5");
  poly(c, [[0,490],[0,342],[205,293],[370,381],[610,377],[795,445],[1000,370],[1250,388],[1420,300],[1600,355],[1600,550]], "#679988");
  const water = c.createLinearGradient(0, 430, 0, 900);
  water.addColorStop(0, "#65B8B2"); water.addColorStop(.65, "#248B91"); water.addColorStop(1, "#155F70");
  c.fillStyle = water; c.fillRect(0, 460, 1600, 440);
  // Receding water ribbons carry depth without crossing names or warnings.
  for (let i = 0; i < 30; i++) {
    const z = 40 - ((i * 2.7 + (reduced ? 0 : time * 4)) % 46);
    const x = Math.sin(i * 12.31) * 10;
    face(c, [[x,0,z],[x+1.2,0,z],[x+1.7,0,z+.16],[x+.2,0,z+.16]], i % 4 ? "#74C7BE55" : "#D4EED499");
  }
  for (const sign of [-1,1]) {
    face(c, [[sign*10,-.6,-6],[sign*30,0,-6],[sign*30,0,75],[sign*9,.3,75],[sign*10,.4,17],[sign*12,.2,2]], "#345D4C");
    face(c, [[sign*10,-.6,-6],[sign*12,.2,2],[sign*10,.4,17],[sign*9,.3,75],[sign*11,1.4,75],[sign*13,1.7,15],[sign*15,1.5,-6]], "#93A171");
    face(c, [[sign*12,.2,2],[sign*10,.4,17],[sign*11,1.4,75],[sign*12,1,16]], "#CEBB86");
    for (let i = 12; i >= 0; i--) tree(c, sign*(12 + Math.sin(i*2)*2), i*5+3, 3.4+(i%4)*.7);
  }
}
function log(c: CanvasRenderingContext2D, time: number, reduced: boolean) {
  ellipse(c, 800, 692, 611, 47, "#123D464D");
  const shades = ["#DEB36D", "#BC874B", "#A66D3C", "#805132", "#583D2D", "#422F28"];
  // Six broad facets wrap a real cylindrical cross-section.
  for (let i = 0; i < 6; i++) {
    const a = -.25 + i * Math.PI / 6, b = a + Math.PI / 6;
    face(c, [[-7.9,Math.cos(a)*.92,Math.sin(a)*-.92],[7.9,Math.cos(a)*.92,Math.sin(a)*-.92],[7.9,Math.cos(b)*.92,Math.sin(b)*-.92],[-7.9,Math.cos(b)*.92,Math.sin(b)*-.92]], shades[i]);
  }
  const [ex,ey] = project([7.9,0,0]);
  ellipse(c, ex, ey, 29, 69, "#E2B77B");
  for (const radius of [1,.73,.43]) {
    c.strokeStyle = "#8F613D"; c.lineWidth = 3; c.beginPath(); c.ellipse(ex, ey, 22*radius, 58*radius, -.07, 0, Math.PI*2); c.stroke();
  }
  // Bark follows the rolling cylinder; no screen-space pattern sliding off it.
  for (let line = 0; line < 8; line++) {
    const a = (line * .45 + (reduced ? 0 : time * .55)) % Math.PI;
    const y = Math.cos(a)*.925, z = -Math.sin(a)*.925;
    const from=project([-7.8,y,z]), to=project([7.65,y,z]);
    c.strokeStyle = a < 1 ? "#F2CF9266" : "#2D241B66"; c.lineWidth=3;
    c.beginPath(); c.moveTo(...from); c.bezierCurveTo(from[0]+280,from[1]+4,to[0]-260,to[1]-4,...to); c.stroke();
  }
}
function runnerX(state: LogRunnerState, player: LogRunnerPlayer) {
  const count = state.runners.length, index = state.runners.indexOf(player);
  return 800 + (index-(count-1)/2)*Math.min(125,1090/Math.max(1,count-1));
}
function runner(c: CanvasRenderingContext2D, p: LogRunnerPlayer, state: LogRunnerState, reduced: boolean) {
  const x = runnerX(state, p);
  const target = currentObstacle(state), answer = target && p.answers.get(target.id);
  const jump = p.pose === "jump" ? Math.sin(clamp(1-p.poseTime/.45)*Math.PI)*87 : 0;
  const duck = p.pose === "duck" ? .55 : 1;
  const bob = reduced ? 0 : Math.sin(state.elapsed*9+p.seat)*3;
  const y = 571-jump+bob;
  ellipse(c,x,587,30-jump*.1,8,"#352B2877");
  c.save(); c.translate(x,y);
  if (!reduced && p.stumbleTime>0) c.rotate(Math.sin(p.stumbleTime*24)*.17);
  c.scale(1,duck);
  // Boots, rounded coat, lit side, braces, mitten hands, beard and one of ten hats.
  box(c,-25,-8,22,18,INK,5); box(c,5,-8,24,18,INK,5);
  box(c,-29,-79,58,76,p.color,18);
  c.fillStyle="#102E3238"; c.beginPath(); c.roundRect(13,-77,16,71,[0,16,16,0]); c.fill();
  box(c,-17,-75,6,66,"#FFF3D7AA",2); box(c,11,-75,6,66,"#FFF3D7AA",2);
  ellipse(c,-33,-34,9,13,"#E8B980"); ellipse(c,33,-34,9,13,"#E8B980");
  ellipse(c,0,-91,25,28,"#F2CF9F");
  poly(c,[[-23,-91],[-16,-67],[0,-58],[17,-70],[24,-91],[13,-83],[-10,-83]],"#624232");
  box(c,-21,-102,17,7,INK,3); box(c,6,-102,17,7,INK,3);
  ellipse(c,0,-90,7,7,"#D79363");
  const hat = p.seat % 5;
  if (hat===0) {box(c,-25,-128,50,22,p.color,10);ellipse(c,0,-132,8,8,CREAM);}
  if (hat===1) poly(c,[[-34,-112],[-19,-126],[-13,-145],[12,-142],[21,-124],[34,-112]],p.color);
  if (hat===2) { box(c,-25,-136,50,25,p.color,4); box(c,-32,-114,64,7,CREAM,2); }
  if (hat===3) { ellipse(c,0,-121,28,18,p.color);box(c,-33,-118,66,8,CREAM,2); }
  if (hat===4) {poly(c,[[-27,-111],[-20,-136],[0,-123],[20,-136],[27,-111]],p.color);}
  label(c,String(p.seat+1),0,-42,26,INK);
  c.restore();
  // Stable labels do not jump with the figure, so identity remains easy to find.
  box(c,x-57,711,114,51,INK,8);
  label(c,p.name,x,727,21,CREAM,"center",103);
  label(c,`${Math.floor(p.survival)} pts`,x,748,15,"#BDDDD0");
  if (answer) {box(c,x-46,400,92,29,CREAM,6);label(c,answer.toUpperCase(),x,415,18,INK);}
  if (p.splashPulse>0) label(c,"SPLASH",x,550,23,CREAM);
}
function hazard(c: CanvasRenderingContext2D, obstacle: LogRunnerObstacle, state: LogRunnerState) {
  const progress=clamp((state.elapsed-obstacle.spawnedAt)/LOG_RUNNER_RULES.warning);
  const z=(1-progress)*27;
  const high=obstacle.kind==="high", fake=obstacle.kind==="fake";
  const y=high?2.3:.55;
  c.save();
  if(fake) c.globalAlpha=.55;
  const body=obstacle.source==="bank"?"#BBD278":ORANGE;
  face(c,[[-8,y,z],[8,y,z],[8,y+.32,z+.3],[-8,y+.32,z+.3]],"#FFCF7B");
  face(c,[[-8,y,z],[8,y,z],[8,y-.33,z],[-8,y-.33,z]],body);
  face(c,[[-8,y-.33,z],[8,y-.33,z],[8,y-.43,z+.3],[-8,y-.43,z+.3]],"#9F5933");
  for(const x of [-6,-3,2,5]) {
    face(c,[[x,y,z],[x+.3,y,z],[x+.65,y+.8,z],[x+.42,y+.85,z]],body);
  }
  const [tx,ty]=project([0,y+.85,z]);
  box(c,tx-87,ty-18,174,36,INK,8);
  label(c,fake?"SPRAY · IGNORE":high?"HIGH · DUCK":"LOW · JUMP",tx,ty,21);
  c.restore();
}
export function drawRiverScene(c: CanvasRenderingContext2D, state: LogRunnerState, reduced: boolean) {
  environment(c,state.elapsed,reduced);
  log(c,state.elapsed,reduced);
  const target=currentObstacle(state);
  if(target) hazard(c,target,state);
  const active=state.runners.filter(p=>p.role==="runner");
  active.forEach(p=>runner(c,p,state,reduced));
  for(const p of state.runners) if(p.splashPulse>0) {
    const progress=1-p.splashPulse/.8,x=runnerX(state,p);
    for(let i=0;i<7;i++) {
      const angle=(i/7)*Math.PI;
      ellipse(c,x+Math.cos(angle)*progress*90,690-Math.sin(angle)*progress*100+progress*80,4,9,CREAM);
    }
  }
  const bank=state.runners.filter(p=>p.role==="bank");
  box(c,28,794,1544,86,"#153C36",14);
  label(c,bank.length?"THE BANK · HECKLE TO MAKE RUNNERS STUMBLE · NO POINTS OR KNOCKOUTS":"STAY ON LONGEST · 1 POINT / SECOND · TOP THREE +15 / +10 / +5",800,815,21);
  bank.forEach((p,i)=>{
    const x=60+i*(1480/Math.max(1,bank.length));
    ellipse(c,x,854,14,14,p.color); label(c,String(p.seat+1),x,854,18,INK);
    label(c,p.name,x+22,854,21,CREAM,"left",110);
  });
  if(!bank.length) label(c,"One obstacle. One tap. Your choice stays locked until it passes.",800,854,22,"#C2DDC5");
}
export function drawRiverHud(c: CanvasRenderingContext2D, state: LogRunnerState) {
  box(c,28,22,1220,132,INK,16);
  label(c,"LOG RUNNER",54,59,35,CREAM,"left");
  const practice=state.elapsed<LOG_RUNNER_RULES.practice;
  label(c,practice?`PRACTICE · ${Math.ceil(LOG_RUNNER_RULES.practice-state.elapsed)}s`:`${state.runners.filter(p=>p.role==="runner").length} ON LOG · ${Math.ceil(state.remaining)}s LEFT`,54,105,23,practice?ORANGE:"#C2DDC5","left");
  const target=currentObstacle(state);
  if(target) {
    label(c,target.kind==="fake"?"LET IT PASS":target.kind==="high"?"DUCK":"JUMP",850,63,56,target.source==="bank"?"#BBD278":ORANGE);
    const owner=state.runners.find(p=>p.id===target.ownerId);
    const subtitle=target.kind==="fake"?"HARMLESS SPRAY · NO TAP NEEDED":target.source==="bank"?`${owner?.name ?? "BANK"}’S HECKLE · STUMBLE ONLY`:practice?"PRACTICE · NO POINTS OR KNOCKOUTS":"TAP ONCE · YOUR CHOICE LOCKS";
    label(c,subtitle,850,112,21,CREAM,"center",715);
    const left=clamp((target.impactAt-state.elapsed)/LOG_RUNNER_RULES.warning);
    box(c,445,170,800,13,"#102E3266",5);box(c,445,170,Math.max(1,800*left),13,ORANGE,5);
    label(c,`${Math.max(0,target.impactAt-state.elapsed).toFixed(1)}s`,1288,179,24,INK);
  } else {
    label(c,practice?"TRY BOTH BUTTONS":"WATCH UPSTREAM",850,68,38,CREAM);
    label(c,practice?"10 SECONDS · EVERYONE IS SAFE":"NEXT WARNING SOON",850,115,22,"#C2DDC5");
  }
  if(state.rescueTime>0) {box(c,505,225,590,54,INK,10); label(c,"PRACTICE MISS · EVERYONE STAYS ON",800,252,27);}
}
export function drawRiverRunway(c: CanvasRenderingContext2D, state: LogRunnerState) {
  // Teach in two beats; the world and all ten identities stay visible below.
  box(c,230,24,1010,329,INK,18);
  label(c,"LOG RUNNER",735,73,55);
  label(c,"Stay on longest. Each second earns a point.",735,130,29);
  label(c,"LOW = JUMP",465,201,38,ORANGE);
  label(c,"HIGH = DUCK",975,201,38,ORANGE);
  label(c,"Tap once per warning. Your choice locks until it passes.",735,258,26);
  label(c,"First 10 seconds: free practice for everyone.",735,307,25,"#C2DDC5");
  box(c,1310,177,186,158,CREAM,18);
  label(c,String(Math.max(1,Math.ceil(state.runway))),1403,237,76,INK);
  label(c,"GET READY",1403,305,22,INK);
  // Identity remains numbered and named even in the ten-player runway.
  state.runners.forEach((p,i)=>label(c,`${p.seat+1} · ${p.name}`,285+i*112,777,17,CREAM,"center",104));
}
export function drawRiverResults(c: CanvasRenderingContext2D, state: LogRunnerState) {
  c.fillStyle="rgba(16,46,50,.94)"; c.fillRect(0,0,1600,900);
  label(c,"RIVER CONQUERED",800,115,70,ORANGE);
  label(c,"SURVIVAL SECONDS + PLACE BONUS = PARTY POINTS",800,185,27);
  const results=logRunnerResults(state);
  results.forEach((r,i)=>{
    const p=state.runners.find(p=>p.id===r.id)!;
    const col=i<5?0:1,row=i%5,x=results.length>5?180+col*665:465;
    const y=272+row*102;
    box(c,x,y,620,81,"#24504F",12);
    ellipse(c,x+34,y+40,19,19,p.color);
    label(c,String(p.seat+1),x+34,y+40,22,INK);
    label(c,`${r.place}. ${p.name}`,x+68,y+29,27,CREAM,"left",365);
    label(c,`${Math.floor(p.survival)}s + ${r.score-Math.floor(p.survival)} bonus`,x+68,y+59,20,"#C2DDC5","left");
    label(c,`${r.score} pts`,x+587,y+40,30,CREAM,"right");
  });
  label(c,"Practice did not score. Bank throws cause stumbles only.",800,830,24,"#C2DDC5");
}
