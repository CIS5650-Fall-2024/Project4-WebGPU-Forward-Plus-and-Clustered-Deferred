import { Mat4, mat4, Vec3, vec3 } from "wgpu-matrix";
import { toRadians } from "../math_util";
import { device, canvas, fovYDegrees, aspectRatio } from "../renderer";

class CameraUniforms {
    readonly buffer = new ArrayBuffer(256);
    private readonly floatView = new Float32Array(this.buffer);

    set viewProjMat(mat: Float32Array) {
        for (let i = 0; i < 16; i++) {
            this.floatView[i] = mat[i]; 
        }
    }

    set viewMat(mat: Float32Array) {
        const offset = 16; 
        for (let i = 0; i < 16; i++) {
            this.floatView[offset + i] = mat[i]; 
        }
    }

    set canvasWidth(width: number) {
        const offset = 32; 
        this.floatView[offset] = width; 
    }

    set canvasHeight(height: number) {
        const offset = 33; 
        this.floatView[offset] = height; 
    }

    set cameraUp(up: Float32Array) {
        const offset = 36; 
        this.floatView[offset] = up[0]; 
        this.floatView[offset + 1] = up[1]; 
        this.floatView[offset + 2] = up[2]; 
    }

    set cameraRight(right: Float32Array) {
        const offset = 40;
        this.floatView[offset] = right[0]; 
        this.floatView[offset + 1] = right[1]; 
        this.floatView[offset + 2] = right[2]; 
    }

    set fovRadians(fov: number) {
        const offset = 43; 
        this.floatView[offset] = fov; 
    }

    set aspectRatio(as: number) {
        const offset = 44; 
        this.floatView[offset] = as; 
    }

    set projMatInverse(mat: Float32Array) {
        const offset = 48; 
        for (let i = 0; i < 16; i++) {
            this.floatView[offset + i] = mat[i]; 
        }
    }
}

export class Camera {
    uniforms: CameraUniforms = new CameraUniforms();
    uniformsGPUBuffer: GPUBuffer;

    projMat: Mat4 = mat4.create();
    cameraPos: Vec3 = vec3.create(-7, 2, 0);
    cameraFront: Vec3 = vec3.create(0, 0, -1);
    cameraUp: Vec3 = vec3.create(0, 1, 0);
    cameraRight: Vec3 = vec3.create(1, 0, 0);
    yaw: number = 0;
    pitch: number = 0;
    moveSpeed: number = 0.004;
    sensitivity: number = 0.15;

    static readonly nearPlane = 0.1;
    static readonly farPlane = 1000;

    keys: { [key: string]: boolean } = {};

    constructor () {
        // ensure the usage is set to `GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST` since we will be copying to this buffer
        // check `lights.ts` for examples of using `device.createBuffer()`
        //
        // note that you can add more variables (e.g. inverse proj matrix) to this buffer in later parts of the assignment
        
        this.uniformsGPUBuffer = device.createBuffer({
            label: "Camera GPU Buffer",
            size: this.uniforms.buffer.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        }); 

        this.projMat = mat4.perspective(toRadians(fovYDegrees), aspectRatio, Camera.nearPlane, Camera.farPlane);

        this.rotateCamera(0, 0); // set initial camera vectors

        window.addEventListener('keydown', (event) => this.onKeyEvent(event, true));
        window.addEventListener('keyup', (event) => this.onKeyEvent(event, false));
        window.onblur = () => this.keys = {}; // reset keys on page exit so they don't get stuck (e.g. on alt + tab)

        canvas.addEventListener('mousedown', () => canvas.requestPointerLock());
        canvas.addEventListener('mouseup', () => document.exitPointerLock());
        canvas.addEventListener('mousemove', (event) => this.onMouseMove(event));       
    }

    private onKeyEvent(event: KeyboardEvent, down: boolean) {
        this.keys[event.key.toLowerCase()] = down;
        if (this.keys['alt']) { // prevent issues from alt shortcuts
            event.preventDefault();
        }
    }

    private rotateCamera(dx: number, dy: number) {
        this.yaw += dx;
        this.pitch -= dy;

        if (this.pitch > 89) {
            this.pitch = 89;
        }
        if (this.pitch < -89) {
            this.pitch = -89;
        }

        const front = mat4.create();
        front[0] = Math.cos(toRadians(this.yaw)) * Math.cos(toRadians(this.pitch));
        front[1] = Math.sin(toRadians(this.pitch));
        front[2] = Math.sin(toRadians(this.yaw)) * Math.cos(toRadians(this.pitch));

        this.cameraFront = vec3.normalize(front);
        this.cameraRight = vec3.normalize(vec3.cross(this.cameraFront, [0, 1, 0]));
        this.cameraUp = vec3.normalize(vec3.cross(this.cameraRight, this.cameraFront));
    }

    private onMouseMove(event: MouseEvent) {
        if (document.pointerLockElement === canvas) {
            this.rotateCamera(event.movementX * this.sensitivity, event.movementY * this.sensitivity);
        }
    }

    private processInput(deltaTime: number) {
        let moveDir = vec3.create(0, 0, 0);
        if (this.keys['w']) {
            moveDir = vec3.add(moveDir, this.cameraFront);
        }
        if (this.keys['s']) {
            moveDir = vec3.sub(moveDir, this.cameraFront);
        }
        if (this.keys['a']) {
            moveDir = vec3.sub(moveDir, this.cameraRight);
        }
        if (this.keys['d']) {
            moveDir = vec3.add(moveDir, this.cameraRight);
        }
        if (this.keys['q']) {
            moveDir = vec3.sub(moveDir, this.cameraUp);
        }
        if (this.keys['e']) {
            moveDir = vec3.add(moveDir, this.cameraUp);
        }

        let moveSpeed = this.moveSpeed * deltaTime;
        const moveSpeedMultiplier = 3;
        if (this.keys['shift']) {
            moveSpeed *= moveSpeedMultiplier;
        }
        if (this.keys['alt']) {
            moveSpeed /= moveSpeedMultiplier;
        }

        if (vec3.length(moveDir) > 0) {
            const moveAmount = vec3.scale(vec3.normalize(moveDir), moveSpeed);
            this.cameraPos = vec3.add(this.cameraPos, moveAmount);
        }
    }

    onFrame(deltaTime: number) {
        this.processInput(deltaTime);

        const lookPos = vec3.add(this.cameraPos, vec3.scale(this.cameraFront, 1));
        const viewMat = mat4.lookAt(this.cameraPos, lookPos, [0, 1, 0]);
        const viewProjMat = mat4.mul(this.projMat, viewMat);
        
        this.uniforms.viewProjMat = viewProjMat; 
        this.uniforms.canvasWidth = canvas.width; 
        this.uniforms.canvasHeight = canvas.height; 
        this.uniforms.viewMat = viewMat; 
        this.uniforms.cameraUp = this.cameraUp; 
        this.uniforms.cameraRight = this.cameraRight; 
        this.uniforms.fovRadians = toRadians(fovYDegrees); 
        this.uniforms.aspectRatio = aspectRatio; 
        this.uniforms.projMatInverse = mat4.inverse(this.projMat); 

        device.queue.writeBuffer(this.uniformsGPUBuffer, 0, this.uniforms.buffer); 
    }
}
