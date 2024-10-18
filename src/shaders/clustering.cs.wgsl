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
@group(0) @binding(0) var<uniform> cu: CameraUniforms;
@group(1) @binding(0) var<storage, read> lightSet: LightSet;
@group(1) @binding(1) var<storage, read_write> clusterSet : ClusterSet;

@compute
@workgroup_size(${moveLightsWorkgroupSize})
fn main(@builtin(global_invocation_id) globalId: vec3u) {
    let idx = globalId.x;
    let len = clusterSet.width * clusterSet.height;
    if (idx >= len) {
        return;
    }

    let xId = idx % clusterSet.width;
    let yId = idx / clusterSet.width;
    let step = vec2f(f32(${tileSize}) / f32(cu.screenSize.x), f32(${tileSize}) / f32(cu.screenSize.y));
    let xBound = vec2f(f32(xId), f32(xId + 1)) * step.x;
    let yBound = vec2f(f32(yId), f32(yId + 1)) * step.y;

    let face0 = normalize(vec3f((2.f * xBound.x - 1.f) * cu.tanHalfFov * cu.aspectRatio, (1.f - 2.f * yBound.x) * cu.tanHalfFov, -1));
    let face1 = normalize(vec3f((2.f * xBound.y - 1.f) * cu.tanHalfFov * cu.aspectRatio, (1.f - 2.f * yBound.x) * cu.tanHalfFov, -1));
    let face2 = normalize(vec3f((2.f * xBound.x - 1.f) * cu.tanHalfFov * cu.aspectRatio, (1.f - 2.f * yBound.y) * cu.tanHalfFov, -1));
    let face3 = normalize(vec3f((2.f * xBound.y - 1.f) * cu.tanHalfFov * cu.aspectRatio, (1.f - 2.f * yBound.y) * cu.tanHalfFov, -1));

    let center = normalize(face0 + face1 + face2 + face3);
    let cosval = min(min(min(dot(center, face0), dot(center, face1)), dot(center, face2)), dot(center, face3));
    let sinval = sqrt(1 - cosval * cosval);

    
    var lightCount : u32 = 0;
    var maxLightCount : u32 = ${maxLightsPerTile};
    for (var lightIdx : u32 = 0; lightIdx < lightSet.numLights; lightIdx++) {
        let light = lightSet.lights[lightIdx];
        
        let lightDist = length(light.pos);
        let lightCetner = light.pos / lightDist;
        var lr : f32 = ${lightRadius};
        let lsin = clamp(lr / lightDist, 0.f, 1.f);
        let lcos = sqrt(1.f - lsin * lsin);
        let lightcosval = dot(lightCetner, center);
        let res = select((cosval * lcos - sinval * lsin), -1.f, lr > lightDist);
        
        if (lightcosval >= res)
        {
            clusterSet.clusters[idx].lights[lightCount] = lightIdx;
            lightCount++;
        }

        if (lightCount >= maxLightCount - 1){
            break;
        }
    }
    clusterSet.clusters[idx].lights[maxLightCount - 1] = lightCount;
}