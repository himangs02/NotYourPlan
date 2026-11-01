const fs = require('fs');
const THREE = require('../apps/web/node_modules/three');

const buf = fs.readFileSync('apps/web/public/models/city.glb');
const chunk0Length = buf.readUInt32LE(12);
const json = JSON.parse(buf.slice(20, 20 + chunk0Length).toString('utf8'));

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

const targets = ['hospital', 'oxxo', 'carcel', 'celeste', 'rojo'];
targets.forEach(t => {
  const matIndices = [];
  json.materials.forEach((m, i) => {
    if (m.name.toLowerCase().includes(t)) matIndices.push({ idx: i, name: m.name });
  });

  const b = new THREE.Box3();
  json.nodes.forEach((n, idx) => {
    if (n.mesh !== undefined) {
      const mesh = json.meshes[n.mesh];
      mesh.primitives.forEach(p => {
        if (matIndices.some(mi => mi.idx === p.material)) {
          const nodeM = getWorldMatrix(idx);
          const totalM = new THREE.Matrix4().multiplyMatrices(modelM, nodeM);
          const acc = json.accessors[p.attributes.POSITION];
          const min = new THREE.Vector3(...acc.min).applyMatrix4(totalM);
          const max = new THREE.Vector3(...acc.max).applyMatrix4(totalM);
          b.expandByPoint(min);
          b.expandByPoint(max);
        }
      });
    }
  });
  const center = b.getCenter(new THREE.Vector3());
  const size = b.getSize(new THREE.Vector3());
  console.log(`[${t.toUpperCase()}]: Center=(${center.x.toFixed(1)}, ${center.y.toFixed(1)}, ${center.z.toFixed(1)}) | MinY=${b.min.y.toFixed(1)}, MaxY=${b.max.y.toFixed(1)} | Size=(${size.x.toFixed(1)}, ${size.y.toFixed(1)}, ${size.z.toFixed(1)})`);
});
