import { Elysia, t } from "elysia";
import { swagger } from "@elysiajs/swagger";
import * as cheerio from "cheerio";

const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const app = new Elysia()
  // Swagger hujjatlarini ulash (http://localhost:3000/swagger manzilida mavjud bo'ladi)
  .use(
    swagger({
      documentation: {
        info: {
          title: "Sensorika API",
          version: "1.0.0",
          description: "Sensorika saytidan o'quvchi ma'lumotlarini olish uchun API",
        },
      },
    })
  )
  .post(
    "/api/student/info",
    async ({ body, set }) => {
      try {
        const { login, password } = body;
        const baseUrl = "https://sensorika.t8s.ru/";

        // Barcha cookie-larni saqlab borish uchun yordamchi funksiyalar
        const cookieMap = new Map<string, string>();
        const updateCookies = (cookiesArray: string[]) => {
          cookiesArray.forEach((c) => {
            const fullStr = c.split(";")[0];
            
            // fullStr mavjudligini tekshiramiz
            if (fullStr) {
              const [key, ...valParts] = fullStr.split("=");
              if (key) cookieMap.set(key.trim(), valParts.join("="));
            }
          });
        };
        const getCookieString = () =>
          Array.from(cookieMap.entries())
            .map(([k, v]) => `${k}=${v}`)
            .join("; ");

        // 1-bosqich: Dastlabki GET so'rov - Sessiya va yashirin tokenlarni olish
        const initialResponse = await fetch(baseUrl, {
          headers: { "User-Agent": userAgent },
        });
        
        // Dastlabki cookie'larni saqlaymiz (masalan, ASP.NET_SessionId)
        updateCookies(initialResponse.headers.getSetCookie() || []);
        const initialHtml = await initialResponse.text();
        const $initial = cheerio.load(initialHtml);

        // Saytdagi login formasidan barcha yashirin (hidden) inputlarni yig'amiz
        const loginData = new URLSearchParams();
        $initial("input[type='hidden']").each((_, el) => {
          const name = $initial(el).attr("name");
          const value = $initial(el).attr("value");
          if (name && value) {
            loginData.append(name, value);
          }
        });

        // O'zimizning login va parolni qo'shamiz
        loginData.append("LogLogin", login);
        loginData.append("LogPassword", password);
        loginData.append("LogRememberMe", "false");

        // 2-bosqich: Saytga POST so'rov yuborish (Tokenlar va Cookie'lar bilan)
        const loginResponse = await fetch(baseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": userAgent,
            Cookie: getCookieString(), // Oldin olingan cookie'larni yuboramiz
            Referer: baseUrl,
            Origin: "https://sensorika.t8s.ru",
          },
          body: loginData.toString(),
          redirect: "manual",
        });

        // Login so'rovidan keyin kelgan yangi cookie'larni (Auth cookie) qo'shamiz
        updateCookies(loginResponse.headers.getSetCookie() || []);

        // 3-bosqich: Olingan cookie bilan Student sahifasiga murojaat qilish
        const studentUrl = "https://sensorika.t8s.ru/Student";
        const studentResponse = await fetch(studentUrl, {
          method: "GET",
          headers: {
            Cookie: getCookieString(), // Tasdiqlangan barcha cookie'lar
            "User-Agent": userAgent,
            Referer: baseUrl,
          },
        });

        if (!studentResponse.ok) {
          set.status = 500;
          return {
            success: false,
            message: "Student sahifasini yuklashda xatolik yuz berdi.",
          };
        }

        const html = await studentResponse.text();

        // Sayt tizimga kirishni baribir rad etgan bo'lsa
        if (html.includes("LogLogin") && !html.includes("DropDownCornerMenu")) {
          set.status = 401;
          return {
            success: false,
            message: "Saytga muvaffaqiyatli kirilmadi. Login yoki parol noto'g'ri.",
          };
        }

        // 4-bosqich: Cheerio yordamida HTML ni parsing qilish
        const $ = cheerio.load(html);

        const fullName = $(".DropDownCornerMenu span.d-none.d-lg-inline")
          .first()
          .text()
          .trim();

        let balanceRaw = $("x-caption.col-lg").first().text() || "";
        const balance = balanceRaw
          .replace(/Баланс:/gi, "") 
          .replace(/[\n\r\t]/g, " ") 
          .replace(/\u00a0/g, " ")   
          .replace(/\s+/g, " ")      
          .trim();

        let nextLesson = $(".fa-bell").parent().text() || "";
        nextLesson = nextLesson
          .replace(/[\n\r\t]/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        return {
          success: true,
          data: {
            fullName: fullName || "Topilmadi",
            balance: balance || "Topilmadi",
            nextLesson: nextLesson || "Topilmadi",
          },
        };
      } catch (error) {
        set.status = 500;
        return {
          success: false,
          message: "Tizim xatosi yuz berdi",
          error: String(error),
        };
      }
    },
    {
      body: t.Object({
        login: t.String({ default: "zafarov170" }),
        password: t.String({ default: "123456" }),
      }),
    }
  )
  .listen(3000);

console.log(
  `🦊 API ishga tushdi: http://${app.server?.hostname}:${app.server?.port}`
);
console.log(
  `📖 Swagger hujjatlari: http://${app.server?.hostname}:${app.server?.port}/swagger`
);
