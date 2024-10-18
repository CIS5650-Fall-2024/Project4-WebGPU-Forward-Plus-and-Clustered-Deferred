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

@group(0) @binding(0) var<uniform> cameraUniforms : CameraUniforms;
@group(0) @binding(1) var<uniform> view : ViewUniforms;
@group(0) @binding(2) var<storage, read> lightSet: LightSet;
@group(0) @binding(3) var<storage, read_write> clusters : Clusters;
@group(0) @binding(4) var<storage, read_write> clusterLights : ClusterLightGroup;

fn linearDepth(depthSample : f32) -> f32 {
  return cameraUniforms.zFar*cameraUniforms.zNear / fma(depthSample, cameraUniforms.zNear-cameraUniforms.zFar, cameraUniforms.zFar);
}

fn getTile(fragCoord : vec4<f32>) -> vec3<u32> {
  // TODO: scale and bias calculation can be moved outside the shader to save cycles.
  let sliceScale = f32(tileCount.z) / log2(cameraUniforms.zFar / cameraUniforms.zNear);
  let sliceBias = -(f32(tileCount.z) * log2(cameraUniforms.zNear) / log2(cameraUniforms.zFar / cameraUniforms.zNear));
  let zTile = u32(max(log2(linearDepth(fragCoord.z)) * sliceScale + sliceBias, 0.0));

  return vec3<u32>(u32(fragCoord.x / (cameraUniforms.outputSize.x / f32(tileCount.x))),
                   u32(fragCoord.y / (cameraUniforms.outputSize.y / f32(tileCount.y))),
                   zTile);
}

fn getClusterIndex(fragCoord : vec4<f32>) -> u32 {
  let tile = getTile(fragCoord);
  return tile.x +
         tile.y * tileCount.x +
         tile.z * tileCount.x * tileCount.y;
}


fn sqDistPointAABB(_point : vec3<f32>, minAABB : vec3<f32>, maxAABB : vec3<f32>) -> f32 {
  var sqDist = 0.0;
  // const minAABB : vec3<f32> = clusters.bounds[tileIndex].minAABB;
  // const maxAABB : vec3<f32> = clusters.bounds[tileIndex].maxAABB;

  // Wait, does this actually work? Just porting code, but it seems suspect?
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

const tileCount : vec3<u32> = vec3<u32>(32u, 18u, 48u);

@compute @workgroup_size(4, 2, 4)
fn main(@builtin(global_invocation_id) global_id : vec3<u32>) {
    let tileIndex = global_id.x +
                    global_id.y * tileCount.x +
                    global_id.z * tileCount.x * tileCount.y;

    var clusterLightCount = 0u;
    var cluserLightIndices : array<u32, ${clusterMaxLights}>;
    for (var i = 0u; i < lightSet.numLights; i = i + 1u) {
        let range = f32(${lightRadius});
            // Lights without an explicit range affect every cluster, but this is a poor way to handle that.
            var lightInCluster = range <= 0.0;

            if (!lightInCluster) {
            let lightViewPos = view.matrix * vec4<f32>(lightSet.lights[i].pos, 1.0);
            let sqDist = sqDistPointAABB(lightViewPos.xyz, clusters.bounds[tileIndex].minAABB, clusters.bounds[tileIndex].maxAABB);
            lightInCluster = sqDist <= (range * range);
        }

        if (lightInCluster) {
            // Light affects this cluster. Add it to the list.
            cluserLightIndices[clusterLightCount] = i;
            clusterLightCount = clusterLightCount + 1u;
        }

        if (clusterLightCount == ${clusterMaxLights}) {
            break;
        }
    }

    var offset = atomicAdd(&clusterLights.offset, clusterLightCount);

    for(var i = 0u; i < clusterLightCount; i = i + 1u) {
        clusterLights.indices[offset + i] = cluserLightIndices[i];
    }
    clusterLights.lights[tileIndex].offset = offset;
    clusterLights.lights[tileIndex].count = clusterLightCount;
}
