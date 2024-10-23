// TODO-2: implement the light clustering compute shader

// ------------------------------------
// Calculating cluster bounds:
// ------------------------------------
// For each cluster (X, Y, Z):
//     - Calculate the screen-space bounds for this cluster in 2D (XY).
//     - Calculate the depth bounds for this cluster in Z (near and far planes).
//     - Convert these screen and depth bounds into view-space coordinates.
//     - Store the computed bounding box (Bounds) for the cluster.

// ------------------------------------
// Assigning lights to clusters:
// ------------------------------------
// For each cluster:
//     - Initialize a counter for the number of lights in this cluster.

//     For each light:
//         - Check if the light intersects with the cluster’s bounding box (Bounds).
//         - If it does, add the light to the cluster's light list.
//         - Stop adding lights if the maximum number of lights is reached.

//     - Store the number of lights assigned to this cluster.

@group(${bindGroup_scene}) @binding(0) var<storage, read> lightSet: LightSet;

@group(${bindGroup_scene}) @binding(1) var<storage, read_write> clusters: array<Cluster>;

@group(${bindGroup_scene}) @binding(2) var<uniform> clusterGrid: ClusterGridMetadata;

@group(${bindGroup_scene}) @binding(3) var<uniform> cameraData: CameraUniforms;

struct Bounds {
    min: vec3<f32>,
    max: vec3<f32>,
};

@compute @workgroup_size(8, 4, 8)
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let clusterX = global_id.x;
    let clusterY = global_id.y;
    let clusterZ = global_id.z;

    if (
        clusterX >= clusterGrid.clusterGridSizeX
        || clusterY >= clusterGrid.clusterGridSizeY
        || clusterZ >= clusterGrid.clusterGridSizeZ
    ) {
        return;
    }

    var clusterIndex = clusterX + clusterY * clusterGrid.clusterGridSizeX + clusterZ * clusterGrid.clusterGridSizeX * clusterGrid.clusterGridSizeY;

    clusters[clusterIndex].numLights = 0;

    let bounds = calculateClusterScreenBounds(clusterX, clusterY, clusterZ, clusterIndex);

    let boundsMin = bounds.min;
    let boundsMax = bounds.max;

    for (var i = 0u; i < lightSet.numLights; i++) {
        let light = lightSet.lights[i];
        // recordDistanceLightCluster(light, boundsMin, boundsMax, clusterIndex, i);

        if (lightIntersectsCluster(light, boundsMin, boundsMax)) {
            if (clusters[clusterIndex].numLights < ${maxLightsPerCluster}) {
                clusters[clusterIndex].lightIndices[clusters[clusterIndex].numLights] = i;
                clusters[clusterIndex].numLights = clusters[clusterIndex].numLights + 1;
            }
        }
    }
}

fn recordDistanceLightCluster(light: Light, boundsMin: vec3<f32>, boundsMax: vec3<f32>, clusterIndex: u32, index: u32) {
    let closestPoint = clamp(light.pos, boundsMin, boundsMax);
    
    let distance = length(light.pos - closestPoint);

    clusters[clusterIndex].lightIndices[index] = u32(distance);
}

fn calculateClusterScreenBounds(clusterX: u32, clusterY: u32, clusterZ: u32, clusterIndex: u32) -> Bounds {
    let minXNDC = 2 * f32(clusterX) / f32(clusterGrid.clusterGridSizeX) - 1;
    let maxXNDC = 2 * f32(clusterX + 1) / f32(clusterGrid.clusterGridSizeX) - 1;
    let minYNDC = 2 * f32(clusterY) / f32(clusterGrid.clusterGridSizeY) - 1;
    let maxYNDC = 2 * f32(clusterY + 1) / f32(clusterGrid.clusterGridSizeY) - 1;

    let minZView = calculateDepthFromZIndex(clusterZ);
    let maxZView = calculateDepthFromZIndex(clusterZ + 1);
    let minZClip = cameraData.projMat * vec4(0, 0, -minZView, 1);
    let maxZClip = cameraData.projMat * vec4(0, 0, -maxZView, 1);
    let minZNDC = minZClip.z / minZClip.w;
    let maxZNDC = maxZClip.z / maxZClip.w;
    
    let boundsViewHom = array<vec4f, 8>(
        cameraData.invProjMat * vec4(minXNDC, minYNDC, minZNDC, 1.0),
        cameraData.invProjMat * vec4(minXNDC, maxYNDC, minZNDC, 1.0),
        cameraData.invProjMat * vec4(minXNDC, minYNDC, maxZNDC, 1.0),
        cameraData.invProjMat * vec4(minXNDC, maxYNDC, maxZNDC, 1.0),
        cameraData.invProjMat * vec4(maxXNDC, minYNDC, minZNDC, 1.0),
        cameraData.invProjMat * vec4(maxXNDC, maxYNDC, minZNDC, 1.0),
        cameraData.invProjMat * vec4(maxXNDC, minYNDC, maxZNDC, 1.0),
        cameraData.invProjMat * vec4(maxXNDC, maxYNDC, maxZNDC, 1.0),
    );

    var boundsMin = boundsViewHom[0].xyz/boundsViewHom[0].w;
    var boundsMax = boundsMin;
    for (var i = 1; i < 8; i++) {
        let cornerView = boundsViewHom[i].xyz/boundsViewHom[i].w;
        boundsMin = min(boundsMin, cornerView);
        boundsMax = max(boundsMax, cornerView);
    }

    return Bounds(boundsMin, boundsMax);
}

fn calculateDepthFromZIndex(clusterZ: u32) -> f32 {
    let logZRatio = log2(cameraData.zFar / cameraData.zNear);
    let clusterDepthSize = logZRatio / f32(clusterGrid.clusterGridSizeZ);
    return cameraData.zNear * exp2(clusterDepthSize * f32(clusterZ));
}

fn lightIntersectsCluster(light: Light, boundsMin: vec3<f32>, boundsMax: vec3<f32>) -> bool {
    let lightPosView = cameraData.viewMat * vec4(light.pos, 1.0);

    let closestPoint = clamp(lightPosView.xyz, boundsMin, boundsMax);

    let lightToClosestPoint = closestPoint - lightPosView.xyz;
    
    return dot(lightToClosestPoint, lightToClosestPoint) <= ${lightRadius}*${lightRadius};
}
