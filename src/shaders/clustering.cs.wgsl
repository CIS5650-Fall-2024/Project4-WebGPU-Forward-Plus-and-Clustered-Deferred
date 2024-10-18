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
@workgroup_size(8, 4, 8)
fn main(@builtin(global_invocation_id) workgroupID: vec3u) 
{
    // tile index and cluster index
    let idx = workgroupID.x;
    let idy = workgroupID.y;
    let idz = workgroupID.z;

    if (idx >= clusterSet.tileNumX || idy >= clusterSet.tileNumY || idz >= clusterSet.tileNumZ) {
        return;
    }

    let clusterIdx = idx + clusterSet.tileNumX * idy + clusterSet.tileNumX * clusterSet.tileNumY * idz;
    
    // ndc range
    let xMin = (f32(idx) / f32(clusterSet.tileNumX)) * 2f - 1f;
    let xMax = (f32(idx + 1) / f32(clusterSet.tileNumX)) * 2f - 1f;
    let yMin = (f32(idy) / f32(clusterSet.tileNumY)) * 2f -1f;
    let yMax = (f32(idy + 1) / f32(clusterSet.tileNumY)) * 2f - 1f;

    let zMinView = cameraUniforms.nclip * pow((cameraUniforms.fclip / cameraUniforms.nclip), f32(idz) / f32(clusterSet.tileNumZ));
    let zMaxView = cameraUniforms.nclip * pow((cameraUniforms.fclip / cameraUniforms.nclip), f32(idz + 1) / f32(clusterSet.tileNumZ));
    let zMinClip = cameraUniforms.projMat * vec4(0, 0, -zMinView, 1);
    let zMaxClip = cameraUniforms.projMat * vec4(0, 0, -zMaxView, 1);
    let zMin = zMinClip.z / zMinClip.w;
    let zMax = zMaxClip.z / zMaxClip.w;
    
    let corners = array<vec4f, 8>(
        vec4(xMin, yMin, zMin, 1.0),
        vec4(xMin, yMax, zMin, 1.0),
        vec4(xMin, yMin, zMax, 1.0),
        vec4(xMin, yMax, zMax, 1.0),
        vec4(xMax, yMin, zMin, 1.0),
        vec4(xMax, yMax, zMin, 1.0),
        vec4(xMax, yMin, zMax, 1.0),
        vec4(xMax, yMax, zMax, 1.0),
    );

    // camera range
    var corners_v = array<vec3f, 8>();
    for (var i = 0u; i < 8u; i++) {
        let cor_v = cameraUniforms.invProjMat * corners[i];
        corners_v[i] = cor_v.xyz / cor_v.w;
    }

    // bbox
    var minPos = corners_v[0];
    var maxPos = corners_v[0];
    for (var i = 1u; i < 8u; i++) {
        minPos = min(minPos, corners_v[i]);
        maxPos = max(maxPos, corners_v[i]);
    }

    // set bbox values
    clusterSet.clusters[clusterIdx].minPos = minPos;
    clusterSet.clusters[clusterIdx].maxPos = maxPos;

    // check lights
    var lightCount = 0;
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        let light = lightSet.lights[lightIdx];
        // light pos in camera
        let lightPosView = cameraUniforms.viewMat * vec4(light.pos, 1.0);

        // find closest point on bbox
        let closestP = clamp(lightPosView.xyz, minPos, maxPos);
        let dis_squ = dot(closestP - lightPosView.xyz, closestP - lightPosView.xyz);

        // check intersect
        if (dis_squ <= (${lightRadius} * ${lightRadius})) {
            // add to cluster light index array
            clusterSet.clusters[clusterIdx].lightInx[lightCount] = lightIdx;
            lightCount++;
            if (lightCount == ${maxLightsNumPerCluster}) {
                // reach maximum lights number
                break;
            }
        }
    }

    // set lights number
    clusterSet.clusters[clusterIdx].numLights = u32(lightCount);
}
