// implement the light clustering compute shader

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
@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

const NUM_CLUSTERS_X: u32 = 16;
const NUM_CLUSTERS_Y: u32 = 9;
const NUM_CLUSTERS_Z: u32 = 24;
const MAX_LIGHTS_PER_CLUSTER: u32 = ${maxLightsPerTile};
const lightRadius: f32 = ${lightRadius};

fn checkLight(lightPos: vec3<f32>, min: vec3<f32>, max: vec3<f32>, r: f32) -> bool {
    let clampX = clamp(lightPos.x, min.x, max.x);
    let clampY = clamp(lightPos.y, min.y, max.y);
    let clampZ = clamp(lightPos.z, min.z, max.z);
    let closestPoint = vec3<f32>(clampX, clampY, clampZ);
    // Calculate the squared distance
    let d = lightPos - closestPoint;
    let dist = dot(d, d);
    if (dist <= r*r) {
        return true;
    }
    else {
        return false;
    }
    //return dist <= r*r ? true : false;
}

@compute
@workgroup_size(${clusterWorkgroupSizeX},${clusterWorkgroupSizeY},${clusterWorkgroupSizeZ})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let clusterX = globalIdx.x;
    let clusterY = globalIdx.y;
    let clusterZ = globalIdx.z;

    if (clusterX >= NUM_CLUSTERS_X || clusterY >= NUM_CLUSTERS_Y || clusterZ >= NUM_CLUSTERS_Z) {
        return;
    }

    let clusterIndex = clusterZ * u32(NUM_CLUSTERS_X) * u32(NUM_CLUSTERS_Y) + clusterY * u32(NUM_CLUSTERS_X) + clusterX;
    // pre-compute
    let m_cluster = &(clusterSet.clusters[clusterIndex]);
    let m_lightSet = &(lightSet);
    let screenSize = camera.screenSize;
    let far = camera.far;
    let near = camera.near;
    let inverseProjMat = camera.inverseProjMat;
    let viewMat = camera.viewMat;

    // calculate screen bounds
    let screenBoundsMin = vec2<f32> (
        f32(clusterX) * (screenSize.x / f32(NUM_CLUSTERS_X)),
        f32(clusterY) * (screenSize.y / f32(NUM_CLUSTERS_Y))
    );
    let screenBoundsMax = vec2<f32>(
        (f32(clusterX) + 1.0) * (screenSize.x / f32(NUM_CLUSTERS_X)),
        (f32(clusterY) + 1.0) * (screenSize.y / f32(NUM_CLUSTERS_Y))
    );
    let ndcMin = vec2<f32>(
        (screenBoundsMin.x / screenSize.x) * 2.0 - 1.0,
        (screenBoundsMin.y / screenSize.y) * 2.0 - 1.0
    );

    let ndcMax = vec2<f32>(
        (screenBoundsMax.x / screenSize.x) * 2.0 - 1.0,
        (screenBoundsMax.y / screenSize.y) * 2.0 - 1.0
    );

    // compute depth planes
    let tileNear = near * pow(far / near, f32(clusterZ) / f32(NUM_CLUSTERS_Z));
    let tileFar = near * pow(far / near, f32(clusterZ + 1u) / f32(NUM_CLUSTERS_Z));

    // Compute view-space AABBs for the cluster
    var viewMin = inverseProjMat * vec4(ndcMin, -1.0, 1.0);
    viewMin /= viewMin.w;
    var viewMax = inverseProjMat * vec4(ndcMax, -1.0, 1.0);
    viewMax /= viewMax.w;

    let clusterMin1 = viewMin.xyz * (tileNear / -viewMin.z);
    let clusterMax1 = viewMax.xyz * (tileNear / -viewMax.z);
    let clusterMin2 = viewMin.xyz * (tileFar / -viewMin.z);
    let clusterMax2 = viewMax.xyz * (tileFar / -viewMax.z);
///////////debug
    (*m_cluster).minDepth = min(min(clusterMin1, clusterMin2), min(clusterMax1, clusterMax2));
    (*m_cluster).maxDepth = max(max(clusterMin1, clusterMin2), max(clusterMax1, clusterMax2));
    var count = 0u;
    let n = (*m_lightSet).numLights;
    // Loop through each light in the scene
    for (var i = 0u; i < n; i++) {
        let light = (*m_lightSet).lights[i];
        let lightPos = viewMat * vec4f(light.pos, 1.0);
        if (checkLight(lightPos.xyz, (*m_cluster).minDepth, (*m_cluster).maxDepth, lightRadius)) {
            if (count <= MAX_LIGHTS_PER_CLUSTER) {
                (*m_cluster).lights[count] = i;
                count++;
            }
            else {
                break;
            } 
        }  
    } 
    (*m_cluster).numLights = count;
}


