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
@group(${bindGroup_scene}) @binding(3) var<uniform> screenDim: vec2f;

@group(${bindGroup_model}) @binding(0) var<uniform> modelMat: mat4x4f;

fn screenToView(screenCoord: vec2f) -> vec3f {
    var ndc: vec4f = vec4f(screenCoord / screenDim * 2.0 - 1.0, -1.0, 1.0);
    var viewCoord: vec4f = cameraUniforms.invProj * ndc;
    viewCoord = viewCoord / viewCoord.w;
    return viewCoord.xyz;
}

fn lineIntersectionWithZPlane(startPoint: vec3f, endPoint: vec3f, zDistance: f32) -> vec3f {
    var direction: vec3f = endPoint - startPoint;
    var normal: vec3f = vec3f(0.0, 0.0, -1.0);
    var t: f32 = (zDistance - dot(normal, startPoint)) / dot(normal, direction);
    return startPoint + t * direction;
}

fn sphereAABBIntersection(center: vec3f, radius: f32, aabbMin: vec3f, aabbMax: vec3f) -> bool {
    var closestPoint: vec3f = clamp(center, aabbMin, aabbMax);
    var distanceSquared: f32 = dot(closestPoint - center, closestPoint - center);
    return distanceSquared <= radius * radius;
}

fn testSphereAABB(i: u32, cluster: Cluster) -> bool
{
    var center: vec3f = (cameraUniforms.viewMat * vec4f(lightSet.lights[i].pos, 1.0)).xyz;
    var radius: f32 = ${lightRadius};

    var aabbMin: vec3f = cluster.minPoint.xyz;
    var aabbMax: vec3f = cluster.maxPoint.xyz;

    return sphereAABBIntersection(center, radius, aabbMin, aabbMax);
}

@compute
@workgroup_size(${clusterWorkGroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    let idx = globalIdx.x;
    let clusterNumXY = u32(${clusterNumX}) * u32(${clusterNumY});

    if (idx >= clusterNumXY * ${clusterNumZ}) {
        return;
    }

    // Calculate z, y, and x coordinates from idx
    var z: u32 = idx / clusterNumXY;
    var y: u32 = (idx % clusterNumXY) / ${clusterNumX};
    var x: u32 = idx % ${clusterNumX};
    
    var clusterXYIdx: vec2f = vec2f(f32(x), f32(y));

    var tileSize: vec2f = screenDim / clusterXYIdx;
    
    var minTile_screenspace: vec2f = clusterXYIdx * tileSize;
    var maxTile_screenspace: vec2f = (clusterXYIdx + vec2f(1.0, 1.0)) * tileSize;

    var minTile: vec3f = screenToView(minTile_screenspace);
    var maxTile: vec3f = screenToView(maxTile_screenspace);

    var zNear: f32 = f32(${zNear});
    var zFar: f32 = f32(${zFar});

    var planeNear: f32 = zNear * pow(zFar / zNear, f32(z) / f32(${clusterNumZ}));
    var planeFar: f32 = zNear * pow(zFar / zNear, f32(z + 1) / f32(${clusterNumZ}));

    var minPointNear: vec3f =
        lineIntersectionWithZPlane(vec3(0, 0, 0), minTile, planeNear);
    var minPointFar: vec3f =
        lineIntersectionWithZPlane(vec3(0, 0, 0), minTile, planeFar);
    var maxPointNear: vec3f =
        lineIntersectionWithZPlane(vec3(0, 0, 0), maxTile, planeNear);
    var maxPointFar: vec3f =
        lineIntersectionWithZPlane(vec3(0, 0, 0), maxTile, planeFar);

    clusterSet.clusters[idx].minPoint = vec4f(min(minPointNear, minPointFar), 0.0);
    clusterSet.clusters[idx].maxPoint = vec4f(min(maxPointNear, maxPointFar), 0.0);

    var lightCount: u32 = lightSet.numLights;
    let cluster = &(clusterSet.clusters[idx]);
    var lightNum: u32 = 0u;

    for (var lightIdx: u32 = 0u; lightIdx < lightSet.numLights; lightIdx++) {
        if (lightNum >= ${maxLightInCluster}) {
            break;
        }
        if (testSphereAABB(lightIdx, *cluster)) {
            (*cluster).lightIndices[lightNum] = lightIdx;
            lightNum++;
        }
    }
    (*cluster).count = lightNum;
}

