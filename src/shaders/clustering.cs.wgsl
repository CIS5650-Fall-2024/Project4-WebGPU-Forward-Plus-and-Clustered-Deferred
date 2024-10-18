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

@group(${bindGroup_scene}) @binding(0) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(1) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(2) var<uniform> cameraUniforms: CameraUniforms;  

@compute
@workgroup_size(${clusterWorkgroupSize})
fn main(@builtin(global_invocation_id) globalID: vec3<u32>,
        @builtin(workgroup_id) workgroup_id: vec3<u32>,
        @builtin(num_workgroups) num_workgroups: vec3<u32>,
        @builtin(local_invocation_index) local_invocation_index: u32
) {
    // check bounds
    if (globalID.x >= numGrid.x || 
        globalID.y >= numGrid.y || 
        globalID.z >= numGrid.z) {
        return;
    }

    // calculate cluster bounds
    // -----------------------

    // uses code from
    // https://github.com/DaveH355/clustered-shading
    // https://www.aortiz.me/2018/12/21/CG.html 

    // calculate screensize (vec2) tile size using canvas dimensions
    let tileSize = cameraUniforms.canvasSize / vec2f(numGrid.xy); 

    // get the current tile in screenspace
    let minTile_screen : vec2f = vec2f(globalID.xy) * tileSize; 
    let maxTile_screen : vec2f = (vec2f(globalID.xy) + 1) * tileSize; 

    // convert min and max tile to view space (trace ray? inverse projection)
    let minTile : vec3f = screenToView(minTile_screen); 
    let maxTile : vec3f = screenToView(maxTile_screen);  

    // get current cluster's near and far planes
    let planeNear : f32 = zNear * pow(zFar / zNear, f32(globalID.z) / f32(numGrid.z)); 
    let planeFar  : f32 = zNear * pow(zFar / zNear, f32(globalID.z + 1) / f32(numGrid.z));  

    // calculate Axis Aligned Bounding Box and assign to cluster
    let minPointNear : vec3f = lineIntersectionWithZPlane(vec3f(0, 0, 0), minTile, planeNear);
    let minPointFar : vec3f = lineIntersectionWithZPlane(vec3f(0, 0, 0), minTile, planeFar);
    let maxPointNear : vec3f = lineIntersectionWithZPlane(vec3f(0, 0, 0), maxTile, planeNear);
    let maxPointFar : vec3f = lineIntersectionWithZPlane(vec3f(0, 0, 0), maxTile, planeFar);

    let clusterIndex = globalID.x + globalID.y * numGrid.x + globalID.z * numGrid.x * numGrid.y;
    let cluster : ptr<storage, Cluster, read_write> = &clusterSet.clusters[clusterIndex]; 

    let minPointAABB : vec3f = min(min(minPointNear, minPointFar),min(maxPointNear, maxPointFar));
    let maxPointAABB : vec3f = max(max(minPointNear, minPointFar),max(maxPointNear, maxPointFar));

    cluster.minPoint = vec4f(minPointAABB, 0.0); 
    cluster.maxPoint = vec4f(maxPointAABB, 0.0); 
    cluster.numLights = 0; 

    // assign lights to current cluster
    // --------------------------------
    
    let numLights: u32 = lightSet.numLights; 

    for (var i : u32 = 0; i < lightSet.numLights; i++) {
        if (cluster.numLights >= ${numLightIndices}) {
            break; 
        }
        if (isLightInCluster(i, cluster)) {
            cluster.lightIndices[cluster.numLights] = i; 
            cluster.numLights++; 
        }
    }

    return; 
}

fn isLightInCluster(lightIdx : u32, cluster : ptr<storage, Cluster, read_write>) -> bool {
    let center : vec3f = vec3f(
        (cameraUniforms.viewMat * vec4f(lightSet.lights[lightIdx].pos, 1)).xyz
    );

    let aabbMin : vec3f = cluster.minPoint.xyz; 
    let aabbMax : vec3f = cluster.maxPoint.xyz; 

    let closestPoint : vec3f = clamp(center, aabbMin, aabbMax); 
    let distanceSquared : f32 = dot(closestPoint - center, closestPoint - center); 

    return distanceSquared <= ${lightRadius} * ${lightRadius}; 
}

fn lineIntersectionWithZPlane(pStart : vec3f, pEnd : vec3f, zDistance : f32) -> vec3f {
    let direction : vec3f = pEnd - pStart; 
    let normal : vec3f = vec3f(0., 0., -1.); // plane normal
    let t : f32 = (zDistance - dot(normal, pStart)) / dot(normal, direction); 

    return pStart + t * direction; 
}

// Convert screen coords to view coords on the camera's near plane
fn screenToView(s : vec2<f32>) -> vec3<f32> {
    // version that doesn't use a inverse projection matrix, but not sure if it works

    // let tanalpha : f32 = tan(cameraUniforms.fovRadians / 2.0); 
    // let V : vec3f = vec3f(0, 1., 0) * nearPlane * tanalpha; 
    // let H : vec3f = vec3f(1., 0, 0) * nearPlane * tanalpha * cameraUniforms.aspectRatio;
    // let planeMiddle : vec3f = vec3f(0, 0, nearPlane); 
    // return planeMiddle + s.x * H + s.y * V; 

    // normalize screen coordinates to NDC on the near plane (which is 0.0 on webgpu)
    var ndc = vec4f(s / cameraUniforms.canvasSize * 2.0 - 1.0, 0.0, 1.0); 
    ndc.y *= -1; 
    var view : vec4f = cameraUniforms.projMatInverse * ndc; 
    view /= view.w; 
    return view.xyz; 
}