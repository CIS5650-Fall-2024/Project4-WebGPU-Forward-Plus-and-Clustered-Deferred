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

@compute
@workgroup_size(${moveLightsWorkgroupSize})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let clusterIndex = global_id.x + 
                       global_id.y * clusterSet.clusterCount[0] + 
                       global_id.z * clusterSet.clusterCount[0] * clusterSet.clusterCount[1];

    let clusterDim = vec2(2.0) / vec2(f32(clusterSet.clusterCount[0]), f32(clusterSet.clusterCount[1]));
    let minXY = -1.0 + vec2(f32(global_id.x), f32(global_id.y)) * clusterDim;
    let maxXY = minXY + clusterDim;

    let clusterSizeZ = f32(clusterSet.clusterCount[2]);
    let zSlice = f32(global_id.z);
    let nearZ  = ${nearPlane} * pow(${farPlane} / ${nearPlane}, zSlice / clusterSizeZ);
    let farZ  = ${nearPlane} * pow(${farPlane} / ${nearPlane}, (zSlice + 1.0) / clusterSizeZ);

    let viewSpaceCorners = array<vec3<f32>, 8>(
        vec3(minXY.x, minXY.y, nearZ),
        vec3(maxXY.x, minXY.y, nearZ),
        vec3(minXY.x, maxXY.y, nearZ),
        vec3(maxXY.x, maxXY.y, nearZ),
        vec3(minXY.x, minXY.y, farZ),
        vec3(maxXY.x, minXY.y, farZ),
        vec3(minXY.x, maxXY.y, farZ),
        vec3(maxXY.x, maxXY.y, farZ)
    );

    var minBound = viewSpaceToWorld(viewSpaceCorners[0], cameraUniforms.invViewProjMat);
    var maxBound = minBound;
    for (var i = 1u; i < 8u; i++) {
        let corner = viewSpaceToWorld(viewSpaceCorners[i], cameraUniforms.invViewProjMat);
        minBound = min(minBound, corner);
        maxBound = max(maxBound, corner);
    }

    clusterSet.clusters[clusterIndex].minBounds = minBound;
    clusterSet.clusters[clusterIndex].maxBounds = maxBound;

    var lightCount: u32 = 0u;
    for (var i: u32 = 0u; i < lightSet.numLights; i++) {
        if (lightCount >= ${maxLightPerCluster}) { break; } 

        let light = lightSet.lights[i];
        if (isSphereIntersectingAABB(light.pos, ${lightRadius}, minBound, maxBound)) {
            clusterSet.clusters[clusterIndex].lightArray[lightCount] = i;
            lightCount++;
        }
    }

    clusterSet.clusters[clusterIndex].noOfLights = lightCount;
    
}

fn isSphereIntersectingAABB(spherePos: vec3<f32>, sphereRadius: f32, boxMin: vec3<f32>, boxMax: vec3<f32>) -> bool {
    let closestPoint = clamp(spherePos, boxMin, boxMax);
    let distance = length(spherePos - closestPoint);
    return distance <= sphereRadius;
}

fn viewSpaceToWorld(point: vec3<f32>, invViewProj: mat4x4<f32>) -> vec3<f32> {
    let clipSpacePt = vec4(point, 1.0);
    let viewSpacePt = invViewProj * clipSpacePt;
    return viewSpacePt.xyz / viewSpacePt.w;
}