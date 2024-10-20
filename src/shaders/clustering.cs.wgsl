@group(${bindGroup_scene}) @binding(0) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(1) var<storage, read_write> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(2) var<uniform> cameraUnif: CameraUniforms;

fn screenSpaceToViewSpace(screenCoord: vec2<f32>) -> vec3<f32> {
    let ndc: vec4<f32> = vec4<f32>((screenCoord / cameraUnif.screenDim) * 2.0 - 1.0, -1.0, 1.0);

    var viewCoord: vec4<f32> = cameraUnif.invProjMat * ndc;
    viewCoord /= viewCoord.w;
    return vec3<f32>(viewCoord.xyz);
}

fn intersectLightClusterAABB(lightPos: vec3<f32>, lightRadius: f32, clusterMin: vec3<f32>, clusterMax: vec3<f32>) -> bool {
    let sphereCenter : vec4<f32> = cameraUnif.viewMat * vec4<f32>(lightPos, 1.0);
    let closetPoint : vec3<f32> = clamp(sphereCenter.xyz, clusterMin, clusterMax);
    let distanceSqr : f32 = dot(closetPoint - sphereCenter.xyz, closetPoint - sphereCenter.xyz);
    return (distanceSqr <= lightRadius * lightRadius);
}

@compute
@workgroup_size(${clusterWorkgroupSize})
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    // ------------------------------------
    // Calculating cluster bounds:
    // ------------------------------------
    let clusterDim: vec3<u32> = vec3<u32>(${clusterDim[0]}, ${clusterDim[1]}, ${clusterDim[2]});
    let clusterIdx = globalIdx.x + globalIdx.y * clusterDim.x + globalIdx.z * clusterDim.x * clusterDim.y;
    if (globalIdx.x >= clusterDim.x || globalIdx.y >= clusterDim.y || globalIdx.z >= clusterDim.z) {
        return;
    }
    let currentCluster = &clusterSet.clusters[clusterIdx];
     
    //- Calculate the screen-space bounds for this cluster in 2D (XY).
    let clusterSize : vec2<f32> = cameraUnif.screenDim / vec2<f32>(clusterDim.xy);
    let clusterSSBoundsMin : vec2<f32> =  vec2<f32>(globalIdx.xy) * clusterSize;
    let clusterSSBoundsMax : vec2<f32> = (vec2<f32>(globalIdx.xy) + 1.0) * clusterSize;

    //- Calculate the depth bounds for this cluster in Z (near and far planes).
    // Using exponential division scheme
    let clusterDepthMin : f32 = zNear * pow(zFar / zNear, f32(globalIdx.z) / f32(clusterDim.z)); //near plane
    let clusterDepthMax : f32 = zNear * pow(zFar / zNear, f32(globalIdx.z + 1u) / f32(clusterDim.z)); //far plane

    //- Convert these screen and depth bounds into view-space coordinates.
    let clusterVSBoundsMin : vec3<f32> = screenSpaceToViewSpace(clusterSSBoundsMin); 
    let clusterVSBoundsMax : vec3<f32> = screenSpaceToViewSpace(clusterSSBoundsMax);
    
    let clusterMinOnNear : vec3<f32> = clusterDepthMin / (-clusterVSBoundsMin.z) * clusterVSBoundsMin;
    let clusterMaxOnNear : vec3<f32> = clusterDepthMin / (-clusterVSBoundsMax.z) * clusterVSBoundsMax;
    let clusterMinOnFar : vec3<f32> = clusterDepthMax / (-clusterVSBoundsMin.z) * clusterVSBoundsMin;
    let clusterMaxOnFar : vec3<f32> = clusterDepthMax / (-clusterVSBoundsMax.z) * clusterVSBoundsMax;

    let minPoint : vec4<f32> = vec4<f32>(min(clusterMinOnNear, clusterMinOnFar), 0.0);
    let maxPoint : vec4<f32> = vec4<f32>(max(clusterMaxOnNear, clusterMaxOnFar), 0.0);

    //- Store the computed bounding box (AABB) for the cluster.
    (*currentCluster).minBounds = minPoint;
    (*currentCluster).maxBounds = maxPoint;

    // ------------------------------------
    // Assigning lights to clusters:
    // ------------------------------------
    // For each cluster:
    //     - Initialize a counter for the number of lights in this cluster.
    var count : u32 = 0;
    let lightSetPtr = &(lightSet);
    //     For each light:
    for (var i : u32 = 0; i < (*lightSetPtr).numLights; i++)
    {
        let currentLight = (*lightSetPtr).lights[i];
        //         - Check if the light intersects with the cluster’s bounding box (AABB).
        if (intersectLightClusterAABB(currentLight.pos, f32(${lightRadius}), minPoint.xyz, maxPoint.xyz))
        {
            //         - If it does, add the light to the cluster's light list.
            (*currentCluster).indices[count] = i;
            count++;
        }
        //         - Stop adding lights if the maximum number of lights is reached.
        if (count == ${maxLightsPerCluster})
        {
            break;
        }
    }
    //     - Store the number of lights assigned to this cluster.
    (*currentCluster).numLights = count;
}