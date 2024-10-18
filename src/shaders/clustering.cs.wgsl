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


@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;

fn isLightInAABB(_point: vec3<f32>, minAABB: vec3<f32>, maxAABB: vec3<f32>, radius: f32) -> bool {
    var closestPoint = vec3<f32>(
        clamp(_point.x, minAABB.x, maxAABB.x),
        clamp(_point.y, minAABB.y, maxAABB.y),
        clamp(_point.z, minAABB.z, maxAABB.z)
    );
    let distanceSquared = dot(_point - closestPoint, _point - closestPoint);
    return distanceSquared <= radius * radius;
}


@compute @workgroup_size(${WORKGROUP_SIZE_X},${WORKGROUP_SIZE_Y},${WORKGROUP_SIZE_Z})
fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let clusterX = global_id.x;
    let clusterY = global_id.y;
    let clusterZ = global_id.z;
    

    let clusterGridSizeX = ${clusterXsize };
    let clusterGridSizeY = ${clusterYsize };
    let clusterGridSizeZ = ${clusterZsize };
    
    let clusterIndex = clusterZ * u32(${clusterXsize}) * u32(${clusterYsize}) + clusterY *  ${clusterXsize } + clusterX;


    if (clusterX >= u32(${clusterXsize }) || clusterY >=  (${clusterYsize })|| clusterZ >= (${clusterZsize })) {
        return;
    }
    

    //pointer set up
    let cluster_ptr = &(clusterSet.clusters[clusterIndex]);
    let lightSet_ptr = &(lightSet);

    let canvasResolution = camera.canvasResolution;
    let far = camera.farPlane;
    let near = camera.nearPlane;
    let invProjMat = camera.invProjMat;
    
    

    let screenMin = vec2<f32>(
        f32(clusterX) * (canvasResolution.x / f32(${clusterXsize })),
        f32(clusterY) * (canvasResolution.y / f32(${clusterYsize }))
    );

    let screenMax = vec2<f32>(
        (f32(clusterX) + 1.0) * (canvasResolution.x / f32(${clusterXsize })),
        (f32(clusterY) + 1.0) * (canvasResolution.y / f32(${clusterYsize }))
    );

    let ndcMin = vec2<f32>(
        (screenMin.x / canvasResolution.x) * 2.0 - 1.0,
        (screenMin.y / canvasResolution.y) * 2.0 - 1.0
    );
    let ndcMax = vec2<f32>(
        (screenMax.x / canvasResolution.x) * 2.0 - 1.0,
        (screenMax.y / canvasResolution.y) * 2.0 - 1.0
    );


//     let Zstep = (far - near) / f32(${clusterZsize });

    
//    let clusterMinZView = (near + f32(clusterZ) * Zstep);
//    let clusterMaxZView = clusterMinZView + Zstep;

   

    // let clusterMinZNDC = (clusterMinZView - near) / (far - near) * 2.0 - 1.0;
    // let clusterMaxZNDC = (clusterMaxZView - near) / (far - near) * 2.0 - 1.0;

    let tileNear = near * pow(far / near, f32(clusterZ) / f32(clusterGridSizeZ));
    let tileFar = near * pow(far / near, f32(clusterZ + 1u) / f32(clusterGridSizeZ));

    var viewMin = invProjMat * vec4(ndcMin, -1.f, 1.f);
    viewMin /= viewMin.w;
    var viewMax = invProjMat * vec4(ndcMax, -1.f, 1.f);
    viewMax /= viewMax.w;

    let minBoundsPos1 = viewMin.xyz * (tileNear / -viewMin.z);
    let maxBoundsPos1 = viewMax.xyz * (tileNear / -viewMax.z);

    let minBoundsPos2 = viewMin.xyz * (tileFar / -viewMin.z);
    let maxBoundsPos2 = viewMax.xyz * (tileFar / -viewMax.z);

   
   
    // var viewMin = invProjMat * vec4<f32>(ndcMin.x, ndcMin.y, tileNearNDC, 1.0);
    // var viewMax = invProjMat * vec4<f32>(ndcMax.x, ndcMax.y, tileNearNDC, 1.0);

    // var viewMin2 = invProjMat * vec4<f32>(ndcMin.x, ndcMin.y, tileFarNDC, 1.0);
    // var viewMax2 = invProjMat * vec4<f32>(ndcMax.x, ndcMax.y, tileFarNDC, 1.0);

    // let viewMinCart = viewMin.xyz / viewMin.w;
    // let viewMaxCart = viewMax.xyz / viewMax.w;

    // let viewMinCart2 = viewMin2.xyz / viewMin2.w;
    // let viewMaxCart2 = viewMax2.xyz / viewMax2.w;

    (*cluster_ptr).minDepth = min(min(minBoundsPos2,  minBoundsPos1), min(maxBoundsPos2,  maxBoundsPos1));
    (*cluster_ptr).maxDepth = max(max(minBoundsPos2,  minBoundsPos1), max(maxBoundsPos2,  maxBoundsPos1));

   
    
    
    
    let maxLightsPerCluster = u32(${MAX_LIGHTS_PER_CLUSTER});
    var lightCount = 0u;
    let lightRadius = f32(${lightRadius}); 

    for (var i = 0u; i < (*lightSet_ptr).numLights; i++) {
        
        let light = (*lightSet_ptr).lights[i];
        let lightPos = camera.viewMat * vec4<f32>(light.pos, 1.0);
        
        if(isLightInAABB(lightPos.xyz, (*cluster_ptr).minDepth, (*cluster_ptr).maxDepth, lightRadius)){
            if (lightCount <= maxLightsPerCluster){
                (*cluster_ptr).lightIndices[lightCount] = i;
                lightCount++;
            }
        }
        
    }
    (*cluster_ptr).numLights = lightCount;
}
