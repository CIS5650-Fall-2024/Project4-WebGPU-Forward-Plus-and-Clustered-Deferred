// TODO-2: implement the light clustering compute shader
// bindGroup_scene is 0
// bindGroup_model is 1
// bindGroup_material is 2
@group(${bindGroup_scene}) @binding(0) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(1) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

// Refernece to: https://github.com/DaveH355/clustered-shading
// screen to view space (camera space)
fn screenToView(screenCoord: vec2f) -> vec3f {
    var ndc = vec4f((screenCoord.x / cameraUniforms.screenWidth) * 2.0 - 1.0, (screenCoord.y / cameraUniforms.screenHeight) * 2.0 - 1.0, -1.0, 1.0); 
    ndc.y = -ndc.y; // WEBGPU ndc.y is inverted?
    var viewPos = cameraUniforms.invProjMat * ndc;
    viewPos /= viewPos.w;
    return viewPos.xyz;
}

fn lineIntersectionWithZPlane(startPoint: vec3f, endPoint: vec3f, zPlane: f32) -> vec3f {
    let direction = endPoint - startPoint;
    let normal = vec3f(0.0, 0.0, -1.0);
    let d = dot(normal, startPoint);
    let t = (zPlane - d) / dot(normal, direction);
    return startPoint + t * direction;
}

fn sphereIntersectsAABB(center: vec3f, aabbMin: vec3f, aabbMax: vec3f) -> bool {
    let radius = f32(${lightRadius}); // shader.ts
    // closest point on the AABB to the sphere center
    let closestPoint = clamp(center, aabbMin, aabbMax);
    // distance between the sphere center and this closest point
    let distanceSquared = dot(closestPoint - center, closestPoint - center);
    return distanceSquared <= radius * radius;
}

@compute
@workgroup_size(${clusterWorkgroupSize}) //maxComputeInvocationsPerWorkgroup = 256
fn main(@builtin(global_invocation_id) globalIdx: vec3u){ //global_invocation_id is equivalent to blockIdx * blockdim + threadIdx
// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (AABB) for the cluster.

// Basic setup
if(globalIdx.x >= u32(cameraUniforms.clusterX) || globalIdx.y >= u32(cameraUniforms.clusterY) || globalIdx.z >= u32(cameraUniforms.clusterZ)) {
    return;
}

let gridSize = vec3f(cameraUniforms.clusterX, cameraUniforms.clusterY, cameraUniforms.clusterZ);
let tileIdx = globalIdx.x + (globalIdx.y * u32(gridSize.x)) + (globalIdx.z * u32(gridSize.x) * u32(gridSize.y));

let zNear = cameraUniforms.zNear;
let zFar = cameraUniforms.zFar;
let screenWidth = cameraUniforms.screenWidth;
let screenHeight = cameraUniforms.screenHeight;
let viewProjMat = cameraUniforms.viewProjMat;

// Calculate the cluster's screen-space bounds in 2D (XY).
let tileSize = vec2f(screenWidth / gridSize.x, screenHeight / gridSize.y);

// Tile in screen space
let minTile_Screenspace = vec2f(f32(globalIdx.x) * tileSize.x, f32(globalIdx.y) * tileSize.y);
let maxTile_Screenspace = vec2f(f32(globalIdx.x + 1) * tileSize.x, f32(globalIdx.y + 1) * tileSize.y);

// Convert tile in the screen space to the space sitting on the near plane
var minTile_Viewspace: vec3f = screenToView(minTile_Screenspace);
var maxTile_Viewspace: vec3f = screenToView(maxTile_Screenspace);

// Calculate the depth bounds for this cluster in Z (near and far planes
var planeNear: f32 = zNear * pow(zFar/zNear, f32(globalIdx.z)/ f32(gridSize.z));
var planeFar: f32 = zNear * pow(zFar/zNear, f32(globalIdx.z + 1)/ f32(gridSize.z));

// Use vec3(0,0,0) or camera position as the starting point
var minPointNear: vec3f = lineIntersectionWithZPlane(vec3f(0.0,0.0,0.0), minTile_Viewspace, planeNear);
var minPointFar: vec3f = lineIntersectionWithZPlane(vec3f(0.0,0.0,0.0), minTile_Viewspace, planeFar);
var maxPointNear: vec3f = lineIntersectionWithZPlane(vec3f(0.0,0.0,0.0), maxTile_Viewspace, planeNear);
var maxPointFar: vec3f = lineIntersectionWithZPlane(vec3f(0.0,0.0,0.0), maxTile_Viewspace, planeFar);

// Store the computed bounding box (AABB) for the cluster.
var minPos: vec4f = vec4f(min(minPointNear, minPointFar), 0.0);
var maxPos: vec4f = vec4f(max(maxPointNear, maxPointFar), 0.0);
clusterSet.clusters[tileIdx].minPos = minPos;
clusterSet.clusters[tileIdx].maxPos = maxPos;

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

// Initialize a counter for the number of lights in this cluster.
var lightNum: u32 = 0u;

for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
    // Stop adding lights if the maximum number of lights is reached.
    if (lightNum >= 503u) {
        break;
    }
    
    var lightPos: vec3f = lightSet.lights[lightIdx].pos;
    lightPos = vec3f((cameraUniforms.viewMat * vec4f(lightPos, 1.0)).xyz);

    // Check if the light intersects with the cluster’s bounding box (AABB).
    if(sphereIntersectsAABB(lightPos, minPos.xyz, maxPos.xyz)) {
        // If it does, add the light to the cluster's light list.
        clusterSet.clusters[tileIdx].lightIndices[lightNum] = lightIdx;
        lightNum++;
    }
}
// Store the number of lights assigned to this cluster
clusterSet.clusters[tileIdx].numLights = lightNum;
}