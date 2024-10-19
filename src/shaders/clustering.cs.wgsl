// TODO-2: implement the light clustering compute shader

@group(${bindGroup_scene}) @binding(0) var<uniform> camUnif: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

@compute
@workgroup_size(${computeClustersWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {

    // Check if cluster is valid
    if (globalIdx.x >= ${numClustersX} || 
        globalIdx.y >= ${numClustersY} || 
        globalIdx.z >= ${numClustersZ}) {
        return;
    }

    // Guidance from https://www.aortiz.me/2018/12/21/CG.html
    // and https://github.com/DaveH355/clustered-shading

    // ------------------------------------
    // Calculating cluster bounds:
    // ------------------------------------
    // For each cluster (X, Y, Z):
    //     - Calculate the screen-space bounds for this cluster in 2D (XY).

    let tileSize = camUnif.resolution / vec2f(${numClustersX}, ${numClustersY}); 
    let minTile_screen : vec2f = vec2f(globalIdx.xy) * tileSize; 
    let maxTile_screen : vec2f = (vec2f(globalIdx.xy) + 1) * tileSize; 

    // Convert to View Space
    let minTile : vec3f = screenToView(minTile_screen); 
    let maxTile : vec3f = screenToView(maxTile_screen);  

    // Bounds from near to far and using an exponential function to distribute more clusters near the camera
    let clusterNear = camUnif.nearFarPlane[0] * pow(camUnif.nearFarPlane[1] / camUnif.nearFarPlane[0], f32(globalIdx.z) / f32(${numClustersZ}));
    let clusterFar = camUnif.nearFarPlane[0] * pow(camUnif.nearFarPlane[1] / camUnif.nearFarPlane[0], f32(globalIdx.z + 1u) / f32(${numClustersZ}));

    // Calculate the AABB of the cluster
    let minPointNear = lineIntersectionWithZPlane(vec3f(0, 0, 0), minTile, clusterNear);
    let minPointFar = lineIntersectionWithZPlane(vec3f(0, 0, 0), minTile, clusterFar);
    let maxPointNear = lineIntersectionWithZPlane(vec3f(0, 0, 0), maxTile, clusterNear);
    let maxPointFar = lineIntersectionWithZPlane(vec3f(0, 0, 0), maxTile, clusterFar);

    let minAABB = min(min(minPointNear, minPointFar), min(maxPointNear, maxPointFar));
    let maxAABB = max(max(minPointNear, minPointFar), max(maxPointNear, maxPointFar));

    
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

    let cluster = &clusterSet.clusters[globalIdx.x + 
                                    globalIdx.y * ${numClustersX} + 
                                    globalIdx.z * ${numClustersX} * ${numClustersY}];

    // Initialize the number of lights in this cluster
    cluster.numLights = 0u;

    // Assign lights to the cluster
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        if (cluster.numLights > ${maxLightsPerCluster}) {
            break;
        }
        if (checkLightIntersectCluster(lightIdx, minAABB, maxAABB)) {
            cluster.lightIndices[cluster.numLights] = lightIdx;
            cluster.numLights++;
        }
    }

    return;
}



fn lineIntersectionWithZPlane(a : vec3f, b : vec3f, zDistance : f32) -> vec3f {
    let normal = vec3f(0., 0., -1.); // normal of z plane in WebGPU
    let direction = b - a; 
    // Find the intersection length for the line and the plane
    let t = (zDistance - dot(normal, a)) / dot(normal, direction); 

    return a + t * direction; 
}

fn checkLightIntersectCluster(lightIdx : u32, minAABB : vec3f, maxAABB : vec3f) -> bool {
    let lightPos = vec3f((camUnif.viewMat * vec4f(lightSet.lights[lightIdx].pos, 1.0)).xyz);

    // Check if light is within the cluster bounds
    let closestPoint = clamp (lightPos, minAABB, maxAABB);
    let dist = dot(closestPoint - lightPos, closestPoint - lightPos);
    return dist <= ${lightRadius} * ${lightRadius};
}

fn screenToView(s : vec2<f32>) -> vec3<f32> {
    var view = vec4f(s / camUnif.resolution * 2.0 - 1.0, 0.0, 1.0); 
    view.y *= -1; 
    view = camUnif.invProjMat * view; 
    view /= view.w; 
    return view.xyz; 
}