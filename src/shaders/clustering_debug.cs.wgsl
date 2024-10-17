// TODO-2: implement the light clustering compute shader
// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.
// ------------------------------------
// Assigning lights to clusters:
// ------------------------------------
// For each cluster:
//     - Initialize a counter for the number of lights in this cluster.
//     For each light:
//         - Check if the light intersects with the cluster’s bounding box (AABB).
//         - If it does, add the light to the cluster's light list.
//         - Stop adding lights if the maximum number of lights is reached.
//     - Store the number of lights assigned to this cluster.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

@compute @workgroup_size(4, 2, 4)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
        if (global_id.x >= clusterSet.numClustersX ||
        global_id.y >= clusterSet.numClustersY ||
        global_id.z >= clusterSet.numClustersZ) {return;}
    
    // Calculating cluster index
    let clusterIndex = global_id.x + 
                       global_id.y * clusterSet.numClustersX + 
                       global_id.z * clusterSet.numClustersX * clusterSet.numClustersY;

    // ------------------------------------
    // Calculating cluster bounds:
    // ------------------------------------

    let tileSize = vec2<f32>(cameraUniforms.width / f32(clusterSet.numClustersX),
                             cameraUniforms.height / f32(clusterSet.numClustersY));

    let maxPoint_sS = vec4<f32>(vec2<f32>(f32(global_id.x + 1u), f32(global_id.y + 1u)) * tileSize, 0.0, 1.0);
    let minPoint_sS = vec4<f32>(vec2<f32>(f32(global_id.x), f32(global_id.y)) * tileSize, 0.0, 1.0);

    let maxPoint_vS = screen2View(maxPoint_sS).xyz;
    let minPoint_vS = screen2View(minPoint_sS).xyz;

    let zNear = cameraUniforms.nearPlane;
    let zFar = cameraUniforms.farPlane;
    let tileNear = -zNear * pow(zFar/ zNear, f32(global_id.z)/f32(clusterSet.numClustersZ));
    let tileFar = -zNear * pow(zFar/ zNear, f32(global_id.z + 1u)/f32(clusterSet.numClustersZ));

    let minPointNear = lineIntersectionToZPlane(cameraUniforms.eyePos, minPoint_vS, tileNear);
    let minPointFar = lineIntersectionToZPlane(cameraUniforms.eyePos, minPoint_vS, tileFar);
    let maxPointNear = lineIntersectionToZPlane(cameraUniforms.eyePos, maxPoint_vS, tileNear);
    let maxPointFar = lineIntersectionToZPlane(cameraUniforms.eyePos, maxPoint_vS, tileFar);

    clusterSet.clusters[clusterIndex].minBounds = min(min(minPointNear, minPointFar),min(maxPointNear, maxPointFar));
    clusterSet.clusters[clusterIndex].maxBounds = max(max(minPointNear, minPointFar),max(maxPointNear, maxPointFar));

    // ------------------------------------
    // Assigning lights to clusters:
    // ------------------------------------
    var lightCount: u32 = 0u;
    for (var i: u32 = 0u; i < lightSet.numLights; i++) {
        let light = lightSet.lights[i];
        let lightViewPos = cameraUniforms.viewMat * vec4<f32>(light.pos, 1.0);
        let minPoint = clusterSet.clusters[clusterIndex].minBounds;
        let maxPoint = clusterSet.clusters[clusterIndex].maxBounds;
        let sqDist = sqDistPointAABB(lightViewPos.xyz, minPoint, maxPoint);
        if (sqDist <= (${lightRadius} * ${lightRadius})){
            if (lightCount < ${maxLightPerCluster}) {
                clusterSet.clusters[clusterIndex].lightIndices[lightCount] = i;
                lightCount++;
            } else {
                break;
            }
        }
    }
    clusterSet.clusters[clusterIndex].lightCount = lightCount;
    
}

fn clipToView(clip : vec4<f32>) -> vec4<f32> {
  let view = cameraUniforms.invProjMat * clip;
  return view / vec4<f32>(view.w, view.w, view.w, view.w);
}

fn screen2View(screen : vec4<f32>) -> vec4<f32> {
  let texCoord = screen.xy / vec2<f32>(cameraUniforms.width, cameraUniforms.height);
  let clip = vec4<f32>(vec2<f32>(texCoord.x, 1.0 - texCoord.y) * 2.0 - vec2<f32>(1.0, 1.0), screen.z, screen.w);
  return clipToView(clip);
}

fn lineIntersectionToZPlane(a : vec3<f32>, b : vec3<f32>, zDistance : f32) -> vec3<f32> {
    let normal = vec3<f32>(0.0, 0.0, 1.0);
    let ab = b - a;
    let t = (zDistance - dot(normal, a)) / dot(normal, ab);
    return a + t * ab;
}

fn projectPointToNDC(viewPos: vec3<f32>, projMat: mat4x4<f32>) -> vec4<f32> {
    let clipPos = projMat * vec4<f32>(viewPos, 1.0);
    return clipPos / clipPos.w;
}

fn sqDistPointAABB(_point : vec3<f32>, minAABB : vec3<f32>, maxAABB : vec3<f32>) -> f32 {
    var sqDist = 0.0;
    for(var i = 0; i < 3; i = i + 1) {
      let v = _point[i];
      if(v < minAABB[i]){
        sqDist = sqDist + (minAABB[i] - v) * (minAABB[i] - v);
      }
      if(v > maxAABB[i]){
        sqDist = sqDist + (v - maxAABB[i]) * (v - maxAABB[i]);
      }
    }

    return sqDist;
  }

fn sphereIntersectsAABB(sphereCenter: vec3<f32>, sphereRadius: f32, aabbMin: vec3<f32>, aabbMax: vec3<f32>) -> bool {
    // For simplicity, assume the frustrum is a cube instead of frustrum
    let closestPoint = clamp(sphereCenter, aabbMin, aabbMax);
    let distance = length(sphereCenter - closestPoint);
    return distance <= sphereRadius * 3.0f;
    //return true;
}

fn unprojectPoint(point: vec4<f32>, invViewProj: mat4x4<f32>) -> vec3<f32> {
    let view = invViewProj * point;
    return view.xyz / view.w;
}