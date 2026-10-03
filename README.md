# Gubbe på Vägen

Ett 3D-spel i webbläsaren där du är en gubbe i Stockholm. Du går runt, väljer bland tio bilmodeller och kör genom stan. Bilarna i trafiken kan du springa fram till och ta medan de kör. Polisen patrullerar, och krockar syns och märks på bilen.

## Spela

Öppna `index.html` i Chrome, Safari, Firefox eller Edge. Spelet är en enda fil och behöver ingen installation, men datorn måste vara uppkopplad eftersom 3D-motorn (Three.js) och typsnitten laddas från internet.

## Kontroller

| Tangent | Gör |
| --- | --- |
| W A S D eller piltangenterna | Gå, eller gasa, bromsa och styr |
| Mus | Titta runt (klicka i spelet först) |
| Shift | Spring |
| Mellanslag | Hoppa, eller handbroms i bilen |
| X / Z | Växla upp / ner |
| G | Byt mellan automat och manuell växellåda |
| E | Kliv in, ta en bil som kör förbi, kliv ur |
| B | Välj bilmodell |
| F | Tuta |
| L | Blåljus och siren, när du kör en polisbil |
| R | Ställ bilen på gatan igen |
| M | Ljud av och på |
| H | Visa hjälp |

På mobil och surfplatta finns en styrspak och knappar på skärmen, och ▲ ▼ för att växla när du kör.

## Innehåll

- **Staden:** Norrmalm, Gamla stan och Södermalm med vatten och broar emellan. Stadshuset med de tre kronorna, Slottet, Hötorgsskraporna, Sergels torg, Kungsträdgården, Storkyrkan och Riddarholmskyrkan. Globen och Kaknästornet syns i horisonten.
- **Bilarna:** halvkombi, sedan, kombi, taxi, SUV, skåpbil och stadsbuss, plus tre sportbilar som är betydligt snabbare: sportbil, superbil och muskelbil.
- **Trafiken:** AI-bilar som kör i högertrafik, svänger i korsningarna, stannar för dig och kör om. Fotgängare går på trottoarerna och hoppar undan för bilar.
- **Polisen:** fyra polisbilar (vita med blågul markering) kör runt i trafiken. Hastighetsgränsen är 30 km/h i Gamla stan, 50 km/h på broarna och 40 km/h i resten av stan, och skylten bredvid hastighetsmätaren visar vad som gäller där du är. Kör du mer än 8 km/h för fort där en polis ser dig, krockar med en polisbil, tar en bil framför dem eller kör på någon, slår de på blåljus och siren. Trafiken drar sig då åt sidan. Polisen följer gatorna dit de såg dig senast och kör rakt mot dig när de har dig i sikte. Stanna bredvid en polisbil så får du böter efter hur mycket för fort du körde. Kommer du utom synhåll och de inte hittar dig ger de upp. Polisbilar kan du också ta, och med L sätter du på blåljuset själv.
- **Växellådan:** varje bil har egna växlar och ett eget varvtal, från bussens fyra växlar till superbilens sju. Automatlådan växlar själv. Trycker du X eller Z blir lådan manuell: i för låg växel slår motorn i varvbegränsaren, i för hög växel orkar den knappt dra. Varvräknaren sitter under hastighetsmätaren.
- **Skador:** bilen bucklas in där den träffas. Ju hårdare krock, desto större buckla. Lacken skrapas, lyktor går sönder, rutorna spricker och hjulen kan bli sneda så att bilen drar åt ena hållet. Krockar mot motorn kostar mest: först ångar den, sedan ryker den och orkar mindre, och till slut lägger den av. Väljer du en ny bil med B får du en hel bil.
- **Ljudet:** motorljuden skapas i spelet efter motortyp. Rak fyra i vanliga bilar, femcylindrig i kombin, turbofyra i polisbilen, diesel i SUV:n och skåpbilen, V8 i muskelbilen, boxersexa med turbo i sportbilen, V10 i superbilen och en stor diesel i bussen, med tryckluftsbroms. Bilarna runt omkring hörs också, liksom däckskrik, krockar, krossat glas och sirener.
- **Grafiken:** himmel med moln och sol, ljus och skuggor beräknade på ett fysikaliskt sätt, reflektioner i bilarnas lack och i fönster och vatten, varierade fönster, sladdmärken och rök. Spelet sänker upplösningen av sig självt om datorn inte hinner med.

Staden är förenklad och byggd på ett rutnät, så gatunamnen ligger ungefär där de hör hemma men inte exakt.
