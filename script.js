/**
 * ==========================================================================
 * CINEMATIC SCROLL-DRIVEN VIDEO CONTROLLER (DUAL-LAYER THROTTLE & ALL-SYNC)
 * MIE YAMIEN PAPPIE WEBSITE
 * ==========================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('cinematic-video');
    const scrollContainer = document.getElementById('main-scroll');
    const loader = document.getElementById('loader');
    const progressBar = document.getElementById('progress-bar');
    const slides = document.querySelectorAll('.content-slide');
    const indicatorSteps = document.querySelectorAll('.indicator-step');
    
    // VARIABEL KONTROL SYNC & THROTTLING
    let targetTime = 0;           // Waktu video target berdasarkan scroll mouse
    let isSeeking = false;         // Kunci perangkat keras (lock) untuk mencegah backlog decoder
    let isVideoLoaded = false;
    let lastSeekTime = 0;          // Waktu terakhir melakukan seek (ms)
    const SEEK_THROTTLE_MS = 33;   // Batasi maksimal ~30 seek per detik (33ms) agar GPU tidak kepanasan/stuck
    let pendingSeekTimeout = null;

    /**
     * OPTIMASI PERFORMA 1: Preloading Video ke Memori RAM
     * Memuat video secara penuh melalui AJAX blob agar data video tersimpan lokal di memori.
     */
    const videoUrl = 'Main.mp4';
    
    if (window.location.protocol === 'file:') {
        console.warn('Akses lokal terdeteksi (file://). Preloading RAM dinonaktifkan.');
        setupDirectVideoLoad();
    } else {
        preloadVideo(videoUrl);
    }

    function preloadVideo(url) {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';

        xhr.onprogress = (event) => {
            if (event.lengthComputable) {
                const percent = (event.loaded / event.total) * 100;
                progressBar.style.width = percent + '%';
            }
        };

        xhr.onload = () => {
            if (xhr.status === 200) {
                const videoBlob = xhr.response;
                const blobUrl = URL.createObjectURL(videoBlob);
                video.src = blobUrl;
                onVideoLoaded();
            } else {
                setupDirectVideoLoad();
            }
        };

        xhr.onerror = () => setupDirectVideoLoad();
        xhr.send();
    }

    function setupDirectVideoLoad() {
        video.src = videoUrl;
        progressBar.style.width = '50%';
        
        video.addEventListener('canplaythrough', () => {
            progressBar.style.width = '100%';
            setTimeout(onVideoLoaded, 300);
        }, { once: true });
    }

    function onVideoLoaded() {
        isVideoLoaded = true;
        video.currentTime = 0;
        video.pause();

        // Hilangkan loader
        setTimeout(() => {
            loader.classList.add('fade-out');
            initScrollSync();
        }, 500);
    }

    /**
     * OPTIMASI PERFORMA 2: Dual-Layer Throttling & Hardware Seeking Lock
     * 
     * Kenapa rewind / scroll cepat tetap delay dan freeze?
     * Video H.264 menggunakan kompresi temporal (I/P/B-frame). Ketika seek mundur (rewind), 
     * browser dipaksa membaca ulang dari Keyframe (I-frame) terdekat lalu mendekode 
     * semua frame setelahnya secara berurutan. Jika seek diperintahkan terlalu cepat 
     * berturut-turut, antrean decoder GPU akan mengalami kemacetan (backlog) dan membuat video freeze.
     * 
     * Solusi Dual-Layer Throttling:
     * 1. Hardware Lock (isSeeking): Jangan seek jika browser masih memproses seek sebelumnya.
     * 2. Time Throttle (SEEK_THROTTLE_MS): Batasi waktu antar seek minimal 33 milidetik.
     * 3. Pending Queue: Jika scroll berubah saat sedang terkunci, simpan target terakhir dan jalankan seek segera setelah kunci terbuka.
     */
    function initScrollSync() {
        // Ketika seek selesai didekode oleh browser, buka kunci
        video.addEventListener('seeked', () => {
            isSeeking = false;
            
            // Periksa jika ada posisi scroll baru yang tertunda
            checkAndSeek();
        });

        // Event listener scroll dengan passive mode
        window.addEventListener('scroll', () => {
            if (!isVideoLoaded || isNaN(video.duration)) return;

            const scrollTop = window.scrollY;
            const maxScroll = scrollContainer.scrollHeight - window.innerHeight;
            
            let scrollFraction = scrollTop / maxScroll;
            scrollFraction = Math.max(0, Math.min(1, scrollFraction));

            // Tentukan target waktu baru
            targetTime = scrollFraction * video.duration;

            // Coba lakukan seek langsung
            checkAndSeek();

            // Update transisi opacity teks
            updateContentOverlay(scrollFraction);
        }, { passive: true });
    }

    function checkAndSeek() {
        if (!isVideoLoaded || isSeeking) return;

        const now = performance.now();
        const timeSinceLastSeek = now - lastSeekTime;

        // Jika perubahan posisi sangat minim, abaikan saja demi efisiensi
        if (Math.abs(video.currentTime - targetTime) < 0.01) return;

        // Bersihkan timeout tertunda jika ada
        if (pendingSeekTimeout) {
            clearTimeout(pendingSeekTimeout);
            pendingSeekTimeout = null;
        }

        // Jika interval waktu memenuhi batas throttle (33ms)
        if (timeSinceLastSeek >= SEEK_THROTTLE_MS) {
            executeSeek(now);
        } else {
            // Jika terlalu cepat, antrekan seek di waktu throttle berikutnya
            const delay = SEEK_THROTTLE_MS - timeSinceLastSeek;
            pendingSeekTimeout = setTimeout(() => {
                if (!isSeeking) {
                    executeSeek(performance.now());
                }
            }, delay);
        }
    }

    function executeSeek(timestamp) {
        isSeeking = true;
        lastSeekTime = timestamp;
        video.currentTime = targetTime;
    }

    /**
     * ANIMASI TRANSISI KONTEN MINIMALIS (Alternating Left & Right)
     */
    function updateContentOverlay(progress) {
        const slideRanges = [
            { start: 0.0, peak: 0.08, end: 0.20 },  // Slide 1 (Kiri)
            { start: 0.23, peak: 0.35, end: 0.48 }, // Slide 2 (Kanan)
            { start: 0.52, peak: 0.63, end: 0.76 }, // Slide 3 (Kiri)
            { start: 0.80, peak: 0.90, end: 1.00 }  // Slide 4 (Kanan)
        ];

        slides.forEach((slide, index) => {
            const range = slideRanges[index];
            let opacity = 0;
            let translateY = 30;

            if (progress >= range.start && progress <= range.end) {
                if (progress < range.peak) {
                    const factor = (progress - range.start) / (range.peak - range.start);
                    opacity = factor;
                    translateY = 30 * (1 - factor);
                } else {
                    if (index === slides.length - 1) {
                        opacity = 1;
                        translateY = 0;
                    } else {
                        const factor = (range.end - progress) / (range.end - range.peak);
                        opacity = factor;
                        translateY = -30 * (1 - factor);
                    }
                }
                slide.classList.add('active');
            } else {
                slide.classList.remove('active');
            }

            slide.style.opacity = opacity;
            slide.style.transform = `translateY(${translateY}px)`;
            slide.style.pointerEvents = opacity > 0.3 ? 'auto' : 'none';
        });

        // Update indikator aktif navigasi kanan
        let activeStep = 0;
        if (progress >= 0.20 && progress < 0.48) activeStep = 1;
        else if (progress >= 0.48 && progress < 0.76) activeStep = 2;
        else if (progress >= 0.76) activeStep = 3;

        indicatorSteps.forEach((step, idx) => {
            if (idx === activeStep) {
                step.classList.add('active');
            } else {
                step.classList.remove('active');
            }
        });
    }

    /**
     * INTERAKSI KLIK INDIKATOR NAVIGASI
     */
    indicatorSteps.forEach((step) => {
        step.addEventListener('click', () => {
            const slideIndex = parseInt(step.getAttribute('data-slide'));
            const maxScroll = scrollContainer.scrollHeight - window.innerHeight;
            
            let targetScroll = 0;
            if (slideIndex === 0) targetScroll = 0;
            else if (slideIndex === 1) targetScroll = maxScroll * 0.33;
            else if (slideIndex === 2) targetScroll = maxScroll * 0.63;
            else if (slideIndex === 3) targetScroll = maxScroll;

            window.scrollTo({
                top: targetScroll,
                behavior: 'smooth'
            });
        });
    });

    // Inisialisasi awal
    updateContentOverlay(0);
});

/**
 * ==========================================================================
 * CARA MENGATASI LAGGING/FREEZE REWIND (PENTING):
 * 
 * Sekalipun kode JavaScript sudah dioptimasi maksimal, rewind (jalan mundur) pada video 
 * bawaan kamera/HP akan tetap terasa berat karena kompresi standar (hanya ada keyframe 
 * setiap beberapa detik sekali). Browser harus memproses puluhan frame bayangan untuk 
 * menampilkan 1 frame rewind.
 * 
 * Solusi Satu-Satunya:
 * Ubah video Anda menjadi format ALL-I / GOP = 1 (Keyframe ada di setiap frame).
 * Silakan instal FFmpeg dan jalankan perintah konversi ini pada terminal Anda:
 * 
 * ffmpeg -i Main.mp4 -g 1 -bf 0 -crf 18 -preset fast Main_Optimized.mp4
 * 
 * Hasil konversi (Main_Optimized.mp4) akan memiliki keyframe penuh di setiap detiknya.
 * Ganti nama file tersebut menjadi Main.mp4 untuk menggantikan video lama.
 * Hasilnya dijamin 100% lancar jaya, instan, dan super responsif baik scroll turun maupun naik!
 * ==========================================================================
 */
