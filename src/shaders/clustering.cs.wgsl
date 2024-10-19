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

const clusterCountX = ${clusterCountX};
const clusterCountY = ${clusterCountY};
const clusterCountZ = ${clusterCountZ};

const numClusters = clusterCountX * clusterCountY * clusterCountZ;
const maxLightsPerCluster = ${maxLightsPerCluster};

@group(${bindGroup_scene}) @binding(0) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(1) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterLights: array<u32>;


fn isSphereIntersectingAABB(center: vec3f, radius: f32, aabbMin: vec3f, aabbMax: vec3f) -> bool {
    let closestPoint = clamp(center, aabbMin, aabbMax);
    let distance = length(center - closestPoint);
    return distance < radius;
}

@compute
@workgroup_size(4, 4, 4)
fn main(@builtin(global_invocation_id) global_id: vec3u) {
    if (global_id.x >= clusterCountX || global_id.y >= clusterCountY || global_id.z >= clusterCountZ) {
        return;
    }

    let clusterId = global_id;
    let clusterIdx = global_id.x + global_id.y * clusterCountX + global_id.z * clusterCountX * clusterCountY;
    let clusterOffset = clusterIdx * (1u + maxLightsPerCluster);
    
    let sliceNDCX = 2.0 / f32(clusterCountX);
    let sliceNDCY = 2.0 / f32(clusterCountY);

    let xMin = -1.0 + f32(clusterId.x) * sliceNDCX;
    let xMax = -1.0 + f32(clusterId.x + 1u) * sliceNDCX;
    let yMin = -1.0 + f32(clusterId.y) * sliceNDCY;
    let yMax = -1.0 + f32(clusterId.y + 1u) * sliceNDCY;
    
    // Convert screen-space to NDC (-1, 1) and filp y
    let ndcMin = vec2f(xMin, yMin);
    let ndcMax = vec2f(xMax, yMax);

    // Logarithmic depth partitioning
    let near = cameraUniforms.nearPlane;
    let far = cameraUniforms.farPlane;

    let logRatio = log(far/ near);
    let minZview = -near * exp(logRatio * f32(clusterId.z) / f32(clusterCountZ));
    let maxZview = -near * exp(logRatio * f32(clusterId.z + 1u) / f32(clusterCountZ));

    let projectMat = cameraUniforms.projMat;
    let minZNDC = ((projectMat[2][2] * minZview) + projectMat[3][2]) / ((projectMat[2][3] * minZview) + projectMat[3][3]);
    let maxZNDC = ((projectMat[2][2] * maxZview) + projectMat[3][2]) / ((projectMat[2][3] * maxZview) + projectMat[3][3]);

    // Compute frustum corners in view space
    var frustumCorners: array<vec3f, 8>;

    let invProjMat = cameraUniforms.invProjMat;

    var ndcPoints = array<vec4f, 8>(
        vec4f(ndcMin.x, ndcMin.y, minZNDC, 1.0),
        vec4f(ndcMax.x, ndcMin.y, minZNDC, 1.0),
        vec4f(ndcMin.x, ndcMax.y, minZNDC, 1.0),
        vec4f(ndcMax.x, ndcMax.y, minZNDC, 1.0),
        vec4f(ndcMin.x, ndcMin.y, maxZNDC, 1.0),
        vec4f(ndcMax.x, ndcMin.y, maxZNDC, 1.0),
        vec4f(ndcMin.x, ndcMax.y, maxZNDC, 1.0),
        vec4f(ndcMax.x, ndcMax.y, maxZNDC, 1.0)
    );

    for (var i = 0u; i < 8u; i = i + 1u) {
        var corner = ndcPoints[i];
        var viewSpaceCorner = invProjMat * corner;
        viewSpaceCorner = viewSpaceCorner / viewSpaceCorner.w;
        frustumCorners[i] = viewSpaceCorner.xyz;
    }

    // Compute AABB of cluster in view space
    var clusterMin = frustumCorners[0];
    var clusterMax = frustumCorners[0];
    for (var i = 1u; i < 8u; i = i + 1u) {
        clusterMin = min(clusterMin, frustumCorners[i]);
        clusterMax = max(clusterMax, frustumCorners[i]);
    }

    // Initialize numLights to 0
    clusterLights[clusterOffset] = 0u;
    var lightCount = 0u;

    let radius = f32(${lightRadius});
    // Assign lights to clusters
    for (var lightIdx = 0u; lightIdx < lightSet.numLights; lightIdx = lightIdx + 1u) {
        
        // Light bounding sphere
        let lightPos = (cameraUniforms.viewMat * vec4f(lightSet.lights[lightIdx].pos, 1.0)).xyz;
        let sphereMin = lightPos - vec3f(radius);
        let sphereMax = lightPos + vec3f(radius);

        //Check intersection between cluster AABB and light sphere AABB
        let intersectMin = max(clusterMin, sphereMin);
        let intersectMax = min(clusterMax, sphereMax);
        let overlaps = all(intersectMin <= intersectMax);

        //let overlaps = isSphereIntersectingAABB(lightPos, radius, clusterMin, clusterMax);
        if (overlaps) {
            var numLights = clusterLights[clusterOffset];
            if (numLights < maxLightsPerCluster) {
                // Add light to cluster
                clusterLights[clusterOffset + 1u + numLights] = lightIdx;
                numLights = numLights + 1u;
                lightCount = lightCount + 1u;
                clusterLights[clusterOffset] = lightCount;
            }else {
                break;
            }
        }
        
    }

}
