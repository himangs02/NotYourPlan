const fs = require('fs');
const THREE = require('../apps/web/node_modules/three');

const buf = fs.readFileSync('apps/web/public/models/city.glb');
const chunk0Length = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + chunk0Length).toString('utf8'));

const calleMatIndices = [];
json.materials.forEach((m, i) => {
  if (/calle|vereda/i.test(m.name)) calleMatIndices.push({ idx: i, name: m.name });
});

function getNodeMatrix(node) {
  const m = new THREE.Matrix4();
  if (node.matrix) {
    m.fromArray(node.matrix);
  } else {
    const pos = new THREE.Vector3(...(node.translation || [0,0,0]));
    const rot = new THREE.Quaternion(...(node.rotation || [0,0,0,1]));
    const scl = new THREE.Vector3(...(node.scale || [1,1,1]));
    m.compose(pos, rot, scl);
  }
  return m;
}

const parentMap = {};
json.nodes.forEach((n, idx) => {
  if (n.children) {
    n.children.forEach(c => parentMap[c] = idx);
  }
});

function getWorldMatrix(nodeIdx) {
  const chain = [nodeIdx];
  let cur = nodeIdx;
  while (parentMap[cur] !== undefined) {
    cur = parentMap[cur];
    chain.unshift(cur);
  }
  const worldM = new THREE.Matrix4();
  for (let idx of chain) {
    worldM.multiply(getNodeMatrix(json.nodes[idx]));
  }
  return worldM;
}

const autoScale = 1.8564664;
const modelPos = new THREE.Vector3(14.40636, 7.11761, 2.22705);
const modelM = new THREE.Matrix4().compose(modelPos, new THREE.Quaternion(), new THREE.Vector3(autoScale, autoScale, autoScale));

const roadBoxes = [];
json.nodes.forEach((n, idx) => {
  if (n.mesh !== undefined) {
    const mesh = json.meshes[n.mesh];
    const matchingPrims = mesh.primitives.filter(p => calleMatIndices.some(cm => cm.idx === p.material));
    if (matchingPrims.length > 0) {
      const nodeM = getWorldMatrix(idx);
      const totalM = new THREE.Matrix4().multiplyMatrices(modelM, nodeM);
      matchingPrims.forEach(p => {
        const mat = calleMatIndices.find(cm => cm.idx === p.material);
        const acc = json.accessors[p.attributes.POSITION];
        // transform all 8 corners of the box
        const corners = [
          new THREE.Vector3(acc.min[0], acc.min[1], acc.min[2]).applyMatrix4(totalM),
          new THREE.Vector3(acc.max[0], acc.min[1], acc.min[2]).applyMatrix4(totalM),
          new THREE.Vector3(acc.min[0], acc.max[1], acc.min[2]).applyMatrix4(totalM),
          new THREE.Vector3(acc.max[0], acc.max[1], acc.min[2]).applyMatrix4(totalM),
          new THREE.Vector3(acc.min[0], acc.min[1], acc.max[2]).applyMatrix4(totalM),
          new THREE.Vector3(acc.max[0], acc.min[1], acc.max[2]).applyMatrix4(totalM),
          new THREE.Vector3(acc.min[0], acc.max[1], acc.max[2]).applyMatrix4(totalM),
          new THREE.Vector3(acc.max[0], acc.max[1], acc.max[2]).applyMatrix4(totalM),
        ];
        const b = new THREE.Box3();
        corners.forEach(c => b.expandByPoint(c));
        roadBoxes.push({ node: n.name || idx, mat: mat.name, box: b });
      });
    }
  }
});

console.log('Total road/sidewalk segments found:', roadBoxes.length);
roadBoxes.forEach((r, i) => {
  const center = r.box.getCenter(new THREE.Vector3());
  const size = r.box.getSize(new THREE.Vector3());
  if (size.x > 3 || size.z > 3) {
    console.log(`[${i}] ${r.mat} | Center: x=${center.x.toFixed(2)}, y=${center.y.toFixed(2)}, z=${center.z.toFixed(2)} | Size: dx=${size.x.toFixed(2)}, dy=${size.y.toFixed(2)}, dz=${size.z.toFixed(2)}`);
  }
});
