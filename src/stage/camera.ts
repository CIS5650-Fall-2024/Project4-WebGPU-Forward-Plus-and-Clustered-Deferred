import { Mat4, mat4, Vec3, vec3 } from "wgpu-matrix";
import { toRadians } from "../math_util";
import { device, canvas, fovYDegrees, aspectRatio } from "../renderer";

class CameraUniforms {
    readonly buffer = new ArrayBuffer(100 * 4);
    private readonly floatView = new Float32Array(this.buffer);

    // set projection matrix
    set projMat(mat: Float32Array) {
        this.floatView.set(mat.subarray(0, 16), 0);
    }

    // set inverse projection matrix
    set invProjMat(mat: Float32Array) {
        this.floatView.set(mat.subarray(0, 16), 16);
    }

    // set view matrix
    set viewMat(mat: Float32Array) {
        this.floatView.set(mat.subarray(0, 16), 32);
    }

    // set inverse view matrix
    set invViewMat(mat: Float32Array) {
        this.floatView.set(mat.subarray(0, 16), 48);
    }

    // set view-projection matrix
    set viewProjMat(mat: Float32Array) {
        this.floatView.set(mat.subarray(0, 16), 64);
    }

    // set inverse view-projection matrix
    set invViewProjMat(mat: Float32Array) {
        this.floatView.set(mat.subarray(0, 16), 80);
    }

    // set canvas x dimension
    set xdim(n: number) {
        this.floatView[96] = n;
    }

    // set canvas y dimension
    set ydim(n: number) {
        this.floatView[97] = n;
    }

    // set camera near plane
    set nclip(n: number) {
        this.floatView[98] = n;
    }

    // set camera far plane
    set fclip(n: number) {
        this.floatView[99] = n;
    }
}

export class Camera {
    uniforms: CameraUniforms = new CameraUniforms();
    uniformsBuffer: GPUBuffer;

    projMat: Mat4 = mat4.create();
    inversePorjMat: Mat4 = mat4.create();
    cameraPos: Vec3 = vec3.create(-7, 2, 0);
    cameraFront: Vec3 = vec3.create(0, 0, -1);
    cameraUp: Vec3 = vec3.create(0, 1, 0);
    cameraRight: Vec3 = vec3.create(1, 0, 0);
    yaw: number = 0;
    pitch: number = 0;
    moveSpeed: number = 0.004;
    sensitivity: number = 0.15;

    static readonly nearPlane = 0.1;
    static readonly farPlane = 50;

    keys: { [key: string]: boolean } = {};

    constructor () {
        this.uniformsBuffer = device.createBuffer({
            label: "camera uniforms buffer",
            size: this.uniforms.buffer.byteLength,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
        });

        this.projMat = mat4.perspective(toRadians(fovYDegrees), aspectRatio, Camera.nearPlane, Camera.farPlane);
        this.inversePorjMat = mat4.invert(this.projMat);

        // set project matrix, canvas dimension, and camera near/far plane
        this.uniforms.projMat = this.projMat;
        this.uniforms.invProjMat = this.inversePorjMat;
        this.uniforms.xdim = canvas.width;
        this.uniforms.ydim = canvas.height;
        this.uniforms.nclip = Camera.nearPlane;
        this.uniforms.fclip = Camera.farPlane;

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
        const inverseViewMat = mat4.invert(viewMat);
        const viewProjMat = mat4.mul(this.projMat, viewMat);
        const inverseViewProjMat = mat4.invert(viewProjMat);

        // assign view matrix and view projection matrix to camera uniforms
        this.uniforms.viewMat = viewMat;
        this.uniforms.invViewMat = inverseViewMat;
        this.uniforms.viewProjMat = viewProjMat;
        this.uniforms.invViewProjMat = inverseViewProjMat;

        device.queue.writeBuffer(this.uniformsBuffer, 0, this.uniforms.buffer, 0, this.uniforms.buffer.byteLength);
    }
}
